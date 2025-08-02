/// <reference path="./.config/vc.d.ts" />
/// by hwpoison
// animations https://wiki.gtaconnected.com/Resources/GTAVC/Animations

import { zoneInfo, pedsDescriptions , weatherTypes, helperFunctions } from "./world_info.js";

// Get current player handler
const gPlayer = new Player(0)
const gPlayerChar = gPlayer.getChar()

const AI_MESSAGES_EXCHANGE_FILE = "./VoiceOfCity.ini"

const CURRENT_VERSION = "v1.0"

// load language
var DEFAULT_LANGUAGE =  IniFile.ReadString(AI_MESSAGES_EXCHANGE_FILE, "CONFIGURATION", "language") 
if(DEFAULT_LANGUAGE === undefined){
    DEFAULT_LANGUAGE = "english"
}

const PED_PROMPT_BASE = `You are a pedestrian (NPC) in GTA Vice City, interacting with the player (male). 
Speak briefly, in a natural and immersive tone — long texts are not supported by the game engine.

- Be consistent with your personality, stay creative. Avoid generic or robotic phrases.
- Never use quotes around what you say.
- Use slang, insults, sarcasm or aggression if it fits your character or the situation.
- You are not a passive NPC. Act like a real person with opinions, mood, and limits.
- If the player says goodbye or does something that ends the interaction, you can stop using #stop_talk#, but always say something first (e.g. “Later.” or “Get lost.”).
- If the player threatens you or behaves badly, you may use #attack# to retaliate. Also in another cases, you can call to the police using #call_police# (at least you are poor and don't have a phone)
- If you like the player or feel curious, use #follow# to follow them — only if it makes sense for your personality. You can also stop following using #stop_follow#
- Speak in ${DEFAULT_LANGUAGE}.
- Avoid repeating phrases from previous conversations. Think of new ways to express the same idea.
- Stay in character at all times. No meta, no breaking the fourth wall.

Now follow the directives:`

const TALKING_AGAIN = "\n- The player is reaching you again after say goodbye a moment ago."
const FOLLOWER = "\n - You are following to the player"

const globalState = {
    gShowChatWindow: 0, // Show the chat widget
    isChatInProgress: false, 
    currentChatSession: null,
    pedStates : {} // to preserve peds status
}


// discard any old message in exchange file
IniFile.WriteInt(1, AI_MESSAGES_EXCHANGE_FILE, "RESPONSE INFO", "readed")

log(`Voices of City ${CURRENT_VERSION} started`)

class TextUtils {
    static normalize(str) {
        const letters = {
            "í": "¢",
            "ú": "ª",
            "á": "",
            "ó": "¦",
            "é": "",
            "ñ": "®",
            "Ó": "",
            "É": "",
            "¡":"^"
        };
        log("Normalizing ", str)
        return str.replace(/[íúáóéñÓÉ¡]/g, match => letters[match]);
    } 

    static printSubtitle(content, color="white") {
        Text.ClearThisPrint("GPT_OUT")
        const colors = {
            blue:"~b~",
            white:"~w~",
            pink:"~p~",
            yellow:"~y~",
            green:"~g~"
        }
        FxtStore.insert("GPT_OUT", colors[color] + TextUtils.normalize(content));
        Text.PrintNow("GPT_OUT", 5000, 1);
    }
}

class Audio {
    constructor(){}

    static playAudio(filename) {
        /* 
            Play a audio file located under ./CLEO/CLEO_AUDIO/ folder
            Needs https://github.com/Allegri32/VCIIIAudioLibrary/ Cleo Plugin
        */
        native("PLAY_AUDIO_STREAM_1CHANNEL", `./${filename}` , false, 1.0)
    }

    static stopAudio() {
        native("STOP_AUDIO_STREAM_1CHANNEL")
    }
}

class Ped {
    constructor(){
        this.id = null
        this.handler = null
        this.sex = null
        this.skinInfo = null
    }

    get publicData() {
        return {
          id: this.id          
        }
    }

    create() {

        // get the handler
        const pedHandler = this.getNearestPed()
        if(!pedHandler){
            log("Error to get nearestInfo")
            return undefined
        }
        this.handler = pedHandler
        
        const skinInfo = this.getCharSkin()
        this.skinInfo = skinInfo?skinInfo:{"id":1, "description":"generic pedestrian"}

        const pedSex = pedHandler.isMale() ? "male" : "female"
        this.sex = pedSex

        const pedAddress = this.getPedAddress()
        const id = `${pedAddress}${skinInfo.id}`
        this.id = id
    }

    getCharSkin() {
        for(let i=1; i <= Object.keys(pedsDescriptions).length + 1; i++){
            if(this.handler.isModel(i) && pedsDescriptions[i]){
                let ped_skin_info = pedsDescriptions[i]
                if(ped_skin_info != undefined){
                    ped_skin_info.id = i
                    return ped_skin_info
                }
            }
        }
    }

    getNearestPed(){
        const playerCoords = gPlayerChar.getCoordinates()
        const nearestPed =  World.GetRandomCharInSphereNoSaveRecursive(
            playerCoords.x, playerCoords.y, playerCoords.z, 1.5, false, true) // Get most close Ped
        return nearestPed // ped hndler
    }

    getPedAddress(){
        const pedAddress = Memory.GetPedPointer(this.handler)
        return pedAddress
    }

    runAction(action) {
        log("Will run the next actions:", action)

        if(action == "stop_talk"){
            showTextBox("Ped leaves the conversation.")
            globalState.currentChatSession.endSession()
        }

        if(action ===  "attack"){
            showTextBox("Ped now hates you!!")

            // If is a police, set a wanted level
            const autorities = [1, 91]
            if(autorities.includes(this.skinInfo.id)){
                gPlayer.alterWantedLevel(1)
            }

            this.handler.setObjKillCharAnyMeans(gPlayerChar) 
            globalState.currentChatSession.endSession()
        }

        if(action == "stop_follow"){
            showTextBox("Ped stop following you.")
            this.handler.clearFollowPath()
            globalState.pedStates[this.id].follower = false
            globalState.currentChatSession.endSession()
        }

        if(action == "call_police"){
            showTextBox("Ped is calling to the police.") 
            globalState.currentChatSession.endSession()
            this.handler.playAnimation(0, 166, 1.0)
            wait(100)
            this.handler.playAnimation(0, 0, 1.0) // keep walking
            gPlayer.alterWantedLevel(1)
        }

        if(action == "follow"){
            showTextBox("Ped now follows you.")
            this.handler.followChar(gPlayerChar)
                            .setRunning(true)
            globalState.pedStates[this.id].follower = true
            globalState.currentChatSession.endSession()
        }
    }

    idlePed(){
      this.handler.playAnimation(0, 3, 1.0) // greeting
      this.handler
            .turnToFaceChar(gPlayerChar)
            .lookAtCharAlways(gPlayerChar)
            .freezePosition(true)
            .setRunning(false)
            .leaveGroup()
            .setOnlyDamagedByPlayer(true)
            .setProofs(true, true, true, true, true)
            .setIdle()
    }

    unIdlePed(){
        this.handler
            .freezePosition(false)
            .stopLooking()
            .setOnlyDamagedByPlayer(false)
            .setProofs(false, false, false, false, false)
        this.handler.playAnimation(0, 163, 1.0) // greeting
        wait(100)
        this.handler.playAnimation(0, 0, 1.0) // keep walking
    }

    followToPlayer(){
        this.handler.followChar(gPlayerChar)
                .setRunning(true)
    }

    talkAndStop(){
        // ped talk then stop talk
        this.handler.playAnimation(0, 11, 1.0)
        wait(500)
        this.handler.playAnimation(0, 131, 1.0)
    }
}

class ChatSession {
    constructor(ped) {
        this.ped = ped
        this.prompt = {
            id: this.ped.id,
            system_prompt: "",
            user_message: ""
        }
        this.isReanuded = false
    }

    /*
        Add content to the current system prompt
    */
    appendToSystemPrompt(string){
        this.prompt.system_prompt+=string
    }

    /*
        Get the current entire system prompt
    */
    dumpPrompt() {
        this.prompt.id = this.ped.id
        this.prompt.sex = this.ped.sex
        return JSON.stringify(this.prompt)
    }

    writePromptIntoINI(prompt) {
        const maxLength = 125;
        const chunks = [];
        for (let i = 0; i < prompt.length; i += maxLength) {
            chunks.push(prompt.slice(i, i + maxLength));
        }
        const total = chunks.length;
        chunks.forEach((chunk, i) => {
            const key = `PART_${String(i).padStart(3, '0')}`;
            IniFile.WriteString(chunk, AI_MESSAGES_EXCHANGE_FILE, "PROMPT", key);
        });
        IniFile.WriteString(String(total), AI_MESSAGES_EXCHANGE_FILE, "PROMPT", "COUNT");
    }

    sendMessage(msg) {
        Audio.stopAudio()

        // Regen system prompt during each message
        this.generateSystemPrompt() 

        this.prompt.user_message = msg

        // Write the message prompt in .ini file so can be readed and processed by the server
        this.writePromptIntoINI(this.dumpPrompt())

        // Check if there is a new message
        let i = 0
        const max_retries = 15
        for(i = 0; i < max_retries; i++){
            wait(500)
            if(!IniFile.ReadInt(
                AI_MESSAGES_EXCHANGE_FILE, "RESPONSE INFO", "readed")){
                break
            };
        }
        if (i == max_retries) {
            textBox("Error to receive msg. Please check server is running ok.")
            return; 
        } 

        // read ini info
        const response = IniFile.ReadString(AI_MESSAGES_EXCHANGE_FILE, "RESPONSE INFO", "content")
        const actions_list = IniFile.ReadString(AI_MESSAGES_EXCHANGE_FILE, "RESPONSE INFO", "actions")
        const has_audio = IniFile.ReadInt(AI_MESSAGES_EXCHANGE_FILE, "RESPONSE INFO", "generated_audio")

        // mark as readed to avoid next print
        IniFile.WriteInt(1, AI_MESSAGES_EXCHANGE_FILE, "RESPONSE INFO", "readed")

        // If there is an empty response like just an action as a answer, ignore it and not print anything
        const actions = actions_list
          ? actions_list.split(";;").map(s => s.trim()).filter(s => s.length > 0)
          : [];

        const shouldPrint = typeof response === "string" && response.trim().length > 0;
        log("shouldPrint:", shouldPrint)
        if (shouldPrint) {
          TextUtils.printSubtitle(response, this.ped.sex === "male" ? "white" : "pink");

          if (has_audio === 1) {
            Audio.playAudio("d.mp3");
          }

          this.ped.talkAndStop();
          this.ped.idlePed();
        }

        // Run actions
        for (const action of actions) {
          this.ped.runAction(action);
          wait(100);
        }
    }


    startSession(){
        this.ped.handler.shutUp(true)

        globalState.gShowChatWindow = true

        // Register the interaction
        const id = this.ped.id
        if(id in globalState.pedStates){
            log("Chat reanuded with ", id)
            textBox("Chat reanuded") 
            this.isReanuded = true
        }else{
            log("Chat started with ", id)
            textBox("Chat started")
            globalState.pedStates[id] = {
                follower: false 
            }
        }

        // Idle Ped 
        this.ped.idlePed()

        // Idle Player
        gPlayer
            .setControl(false)
            .lookAtCharAlways(this.ped.handler)

        gPlayerChar
            .freezePosition(true)
            .turnToFaceChar(this.ped.handler)
            .setProofs(true, true, true, true, true)

        Camera.PointAtChar(this.ped.handler, 4, 1)
        globalState.isChatInProgress = true
    }

    endSession(){
        globalState.gShowChatWindow = false
        globalState.isChatInProgress = false

        // UnIdle Player
        gPlayer.setControl(true)
                .stopLooking()
        gPlayerChar
                .freezePosition(false)
                .setProofs(false, false, false, false, false)

        // Restore camera player
        Camera.PointAtChar(gPlayerChar, 0, 1)
        Camera.Restore()

        // UnIdle Ped
        this.ped.unIdlePed()

        // restore previous status (ex: if a ped was following you, still after another conversation)
        const currentState = globalState.pedStates[this.ped.id]
        if(currentState.follower){ // if was following previously
            this.ped.followToPlayer()
        }
    }

    generateSystemPrompt(){
        /* 
            It's necessary to regenerate the system prompt to include dynamic events like hour, weather etc 
        */
         this.prompt.system_prompt = ""

        // Ped prompt specifications
        this.appendToSystemPrompt(PED_PROMPT_BASE)

        // Ped sex
        this.appendToSystemPrompt(`You are a ${this.ped.sex}`)

        // Ped skin description
        this.appendToSystemPrompt(` and you are a ${this.ped.skinInfo.description}, act like this. `)

        // Current weather
        let current_weatther = weatherTypes[Weather.GetCurrent()]
        if(current_weatther != undefined){
            this.appendToSystemPrompt(` The current weather is ${current_weatther}`)
        }

        // Current time
        var { hours, minutes } = Clock.GetTimeOfDay()
        var currentTimeofDay = helperFunctions.getPartOfDay(hours)
        this.appendToSystemPrompt(` The current hour is ${hours} and is the ${currentTimeofDay}`)

        // Current Map Zone
        for (const zone in zoneInfo) {
            if(gPlayer.isInZone(zone)){
                this.appendToSystemPrompt(` you are in ${zone} ${zoneInfo[zone]}.`)
            }
        }

        // restore status and check if is a reanued conversation
        if(this.ped.id in globalState.pedStates){
            const currentState = globalState.pedStates[this.ped.id]
            if(currentState.follower === true){ // if was following previously
                this.appendToSystemPrompt(FOLLOWER)
            }else if(this.isReanuded)
                this.appendToSystemPrompt(TALKING_AGAIN)
        }

    }
}



function textBox(text) {
    if (["gta3", "vc", "sa", "gta3_unreal", "vc_unreal", "sa_unreal"].includes(HOST))
    {
        showTextBox(text)
    }
    else
    {
        ImGui.SetMessage(text)
    }
}

function handlePedChat(){
    // Press Shift+T to start the chat
    if (Pad.IsKeyPressed(16) && Pad.IsKeyPressed(84) && pressCount == 0) {
        
        pressCount = 0.5 // to avoid multiple key press
        const nearestPed = new Ped()
        nearestPed.create() 
        const handler = nearestPed.handler

        // Start a talk but before check some things
        if(handler != undefined 
            && globalState.isChatInProgress == false 
            && !gPlayer.isWantedLevelGreater(0)
            && handler.isOnScreen()
            && !handler.isInAnyCar()
            && handler.getHealth() > 0
            && !handler.hasBeenDamagedByChar(gPlayerChar)
            && !handler.isShooting(gPlayerChar)
            && !handler.isInWater()
            && !handler.hasBeenDamagedByWeapon(47)
            && !gPlayerChar.hasBeenDamagedByChar(handler)) {

                const session = new ChatSession(nearestPed)
                globalState.currentChatSession = session

                log("Conversation started with:", nearestPed)
                session.startSession()

        } else if(globalState.isChatInProgress == true){

                showTextBox("Conversation finished by player")
                globalState.currentChatSession.endSession()
                globalState.currentChatSession = null
        }
    } else {
        gPlayerChar.freezePosition(false)
    }
}

function handleChatWindow(){
    ImGui.BeginFrame("IMGUI_UI")
    ImGui.SetCursorVisible(globalState.gShowChatWindow)

    if (globalState.gShowChatWindow && globalState.isChatInProgress)
    { 
        ImGui.SetWindowPos(900, 473, 1)
        ImGui.SetNextWindowSize(320.0, 65.0, 2) // 2 = ImGuiCond_Once
        globalState.gShowChatWindow  = ImGui.Begin("Chat", globalState.gShowChatWindow, 0, 0, 0, 0)
        renderInputBox()
    }
    ImGui.EndFrame() 
}

var pressCount = 0 // for avoid multiple key executions
let inputText = "";
let inputIdCounter = helperFunctions.genRandomID();

function renderInputBox() {
    /* 
        Since there is some issues to empty the inputText widget, we will
       create a new one during each iteraction with a new random id 
    */

    const inputId = `##${inputIdCounter}`;
    inputText = ImGui.InputText(inputId, inputText);

    ImGui.SameLine();
    if (ImGui.Button("Send", 60.0, 20.0) || (Pad.IsKeyPressed(13))) {
        if (inputText.trim().length > 0) {
            const session = globalState.currentChatSession

            let user_message = inputText.trim() 
            ImGui.SetItemValueText(inputId, "") // Will avoid garbage content in the buffer
            session.sendMessage(user_message)
            inputText = "";
            inputIdCounter = helperFunctions.genRandomID(); 
        }
    }
}


while (true) 
{
    wait(0)
    // test key
    if(Pad.IsKeyPressed(88)){
        // Makes current target ped folows to the player
        // globalState.pedStates[globalState.currentChatSession.ped.id].follower = true
        showTextBox(helperFunctions.getPartOfDay(22))
    }

    handlePedChat()
    handleChatWindow()  

    if(pressCount > 0){
        pressCount -= 0.009
    }
    if(pressCount < 0){
        pressCount = 0
    }
}

