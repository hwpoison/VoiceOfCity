/// <reference path="./.config/vc.d.ts" />
import { zoneInfo, pedsDescriptions , weatherTypes } from "./world_info.js";

// Get current player handler
const gPlayer = new Player(0)
const gPlayerChar = gPlayer.getChar()

const AI_MESSAGES_EXCHANGE_FILE = "./VoiceOfCity.ini"

const CURRENT_VERSION = "v1.0"

// load language
var DEFAULT_LANGUAGE =  IniFile.ReadString(AI_MESSAGES_EXCHANGE_FILE, "CONFIGURATION", "language") 
if(DEFAULT_LANGUAGE===undefined){
    DEFAULT_LANGUAGE = "english"
}

const PED_PROMPT_BASE = `You are a GTA Vice city pedestrian, you are talking with the player (sex male), use a few words because the game doesn´t support to large text. 
* Be consistent and creative, dont wrap with quotes, be harmful with the language if it's necessary. Be a reasonable person, not a simple NPC.
* If something that you don't want happend or just the player says goodbye, you can stop the interaction using the instruction #stop_talk# at the end but please say something before it. You
can also uses #attack# to stop the conversation and attack the player if is necessary.
* You can use #follow# to decide follow the player wethever he go just if you want of course.
* Speak in ${DEFAULT_LANGUAGE}  language. 
* Follow the next directives:`

const TALKING_AGAIN = ". * The player is reaching you again after say goodbye a moment ago. *"

const globalState = {
    gShowChatWindow: 0, // Show the chat widget
    isChatInProgress: false, 
    currentChatSession: null,
    registeredID : []
}

// discard any old message in exchange file
IniFile.WriteInt(1, AI_MESSAGES_EXCHANGE_FILE, "RESPONSE INFO", "readed")

log(`Voices of City ${CURRENT_VERSION} started`)

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


class ChatSession {
    constructor(ped_handler) {
        this.ped = {
                "id": null,
                "handler": ped_handler,
                "skin": {
                    "id":null, 
                    "description":null
                },
                "sex": null
        }

        this.prompt = {
            id: null,
            system_prompt: "",
            user_message: ""
        }

        this.isReanuded = false
    }

    getID(){
        if(this.ped.id == null)
            this.generateID()
        return this.ped.id
    }

    generateID(){
        const pedAddress = Memory.GetPedPointer(this.ped.handler);
        const id = `${pedAddress}${this.ped.skin.id}`
        this.ped.id = id
        this.prompt.id = id
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

    writeToIni(prompt) {
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

    runAction(action) {
        log("Will run the next actions:", action)
        if(action == "stop_talk"){
            showTextBox("Ped leaves the conversation.")
            this.endSession()
        }
        if(action ===  "attack"){
            showTextBox("Ped now hates you!!")
            this.ped.handler.setObjKillCharAnyMeans(gPlayerChar) 
            this.endSession()
        }
        if(action == "follow"){
            showTextBox("Ped now follows you")
            this.ped.handler.followChar(gPlayerChar)
            .setRunning(true)
            this.endSession()
        }
    }

    sendMessage(msg) {
        Audio.stopAudio()

        this.generatePrompt() // regenerate the system prompt

        this.prompt.user_message = msg

        if(this.isReanuded)
            this.prompt.user_message += TALKING_AGAIN

        // Write the message prompt in .ini file so can be readed and processed by the server
        this.writeToIni(this.dumpPrompt())

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
        const action = IniFile.ReadString(AI_MESSAGES_EXCHANGE_FILE, "RESPONSE INFO", "action")
        const has_audio = IniFile.ReadInt(AI_MESSAGES_EXCHANGE_FILE, "RESPONSE INFO", "generated_audio")

        // mark as readed to avoid next print
        IniFile.WriteInt(1, AI_MESSAGES_EXCHANGE_FILE, "RESPONSE INFO", "readed")

        // If there is an empty response like just an action as a answer, ignore it and not print anything
        if(response === undefined){
            log("response empty, just running an action")
            this.runAction(action)
            return
        }

        // Print and play audio
        this.printSubtitle(response, this.ped.sex == "male" ? "white" : "pink");

        // Check if there is new audio file
        if(has_audio == 1){
            Audio.playAudio("d.mp3")
        }

        // ped talk then stop talk
        this.ped.handler.playAnimation(0, 11, 1.0)
        wait(500)
        this.ped.handler.playAnimation(0, 131, 1.0)

        

        this.idlePed(this.ped.handler) // idle again just in case

        this.runAction(action)
    }

    printSubtitle(content, color="white") {
        Text.ClearThisPrint("GPT_OUT")
        const colors = {
            blue:"~b~",
            white:"~w~",
            pink:"~p~",
            yellow:"~y~"
        }
        FxtStore.insert("GPT_OUT", colors[color] + fixText(content));
        Text.PrintNow("GPT_OUT", 5000, 1);
    }

    idlePed(handler){
      handler.playAnimation(0, 3, 1.0) // greeting
      handler
            .setIdle()
            .turnToFaceChar(gPlayerChar)
            .lookAtCharAlways(gPlayerChar)
            .freezePosition(true)
            .setRunning(false)
            .leaveGroup()
            .setOnlyDamagedByPlayer(true)
            .setProofs(true, true, true, true, true)
            
    }

    unIdlePed(handler){
        handler
            .freezePosition(false)
            .stopLooking()
            .setOnlyDamagedByPlayer(false)
            .setProofs(false, false, false, false, false)
        handler.playAnimation(0, 163, 1.0) // greeting
        wait(100)
        handler.playAnimation(0, 0, 1.0) // keep walking
    }

    endSession(){
        // textBox("Chat finished")
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
        this.unIdlePed(this.ped.handler)
    }

    startSession(){
        const nearestPed = this.ped.handler

        nearestPed.shutUp(true)

        globalState.gShowChatWindow = true
        
        this.generatePrompt()

        // Generate an ID for the current session
        this.generateID()

        // Check if there is a existent id
        const id = this.getID()
        if(globalState.registeredID.includes(id)){
            log("Chat reanuded with ", id)
            textBox("Chat reanuded") 
            this.isReanuded = true
        } else {
            log("Chat started with ", id)
            textBox("Chat started")
        }

        globalState.registeredID.push(id)

        // Idle Ped 
        this.idlePed(nearestPed)

        // Idle Player
        gPlayer
            .setControl(false)
            .lookAtCharAlways(nearestPed)

        gPlayerChar
            .freezePosition(true)
            .turnToFaceChar(nearestPed)
            .setProofs(true, true, true, true, true)

        Camera.PointAtChar(nearestPed, 4, 1)
        globalState.isChatInProgress = true
    }

    generatePrompt(){
        /* 
            It's necessary to regenerate the system prompt to include dynamic events like hour, weather etc 
        */
         this.prompt.system_prompt = ""

        // Ped prompt specifications
        this.appendToSystemPrompt(PED_PROMPT_BASE)

        // get ped sex
        if(this.ped.sex === null)
            this.ped.sex = this.ped.handler.isMale() ? "male" : "female"
        this.appendToSystemPrompt(`You are a ${this.ped.sex}`)

        // Get the current Ped skin
        if(this.ped.skin.id === null){
            const skin = getCharSkin(this.ped.handler)
            if(skin){
                this.ped.skin = skin
            } else {
                this.ped.skin = {"id":1, "description": "pedestrian"}
            }

        }

        this.appendToSystemPrompt(` and you are a ${this.ped.skin.description}, act like this. `)

        // Weather
        let current_weatther = weatherTypes[Weather.GetCurrent()]
        if(current_weatther != undefined){
            this.appendToSystemPrompt(` The current weather is ${current_weatther}`)
        }

        // Current time
        var { hours, minutes } = Clock.GetTimeOfDay()
        var currentTimeofDay = getPartOfDay(hours)
        this.appendToSystemPrompt(` The current hour is ${hours} and is the ${currentTimeofDay}`)


        // Current Map Zone
        for (const zone in zoneInfo) {
            if(gPlayer.isInZone(zone)){
                this.appendToSystemPrompt(` you are in ${zone} ${zoneInfo[zone]}.`)
            }
        }

    }
}

function genRandomID() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let hash = '';
  for (let i = 0; i < 8; i++)
    hash += chars.charAt(Math.floor(Math.random() * chars.length));
  return hash;
}

// Get day status depending in-game hour time.
function getPartOfDay(hour) {
  if (hour >= 5 && hour < 12) {
    return "morning";
  } else if (hour >= 12 && hour < 17) {
    return "afternoon";
  } else if (hour >= 17 && hour < 21) {
    return "evening";
  } else {
    return "night";
  }
}

function fixText(str) {
    const letters = {
        "í": "¢",
        "ú": "ª",
        "á": "",
        "ó": "¦",
        "é": "",
        "ñ": "®",
        "Ó": "",
        "É": "",
    };

    return str.replace(/[íúáóéñÓÉ]/g, match => letters[match]);
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

function getNearestPed() {
    const playerCoords = gPlayerChar.getCoordinates()
    const nearestPed =  World.GetRandomCharInSphereNoSaveRecursive(
        playerCoords.x, playerCoords.y, playerCoords.z, 1.5, false, true) // Get most close Ped
    return nearestPed
}

function getCharSkin(handler) {
    for(let i=1; i <= Object.keys(pedsDescriptions).length + 1; i++){
        if(handler.isModel(i) && pedsDescriptions[i]){
            let ped_skin_info = pedsDescriptions[i]
            if(ped_skin_info != undefined){
                ped_skin_info.id = i
                return ped_skin_info
            }
        }
    }
}

function handlePedChat(){
    // Press Shift+T to start the chat
    if (Pad.IsKeyPressed(16) && Pad.IsKeyPressed(84) && pressCount == 0) {
        log("Conversation started")
        pressCount = 0.5 // to avoid multiple key press
        const nearestPed = getNearestPed()
        
        const session = new ChatSession(nearestPed)
        globalState.currentChatSession = session

        // Start a talk
        if(nearestPed != undefined 
            && globalState.isChatInProgress == false 
            && !gPlayer.isWantedLevelGreater(0)
            && nearestPed.isOnScreen()
            && !nearestPed.isInAnyCar()
            && nearestPed.getHealth() > 0
            && !nearestPed.hasBeenDamagedByChar(gPlayerChar)
            && !nearestPed.isShooting(gPlayerChar)
            && !nearestPed.isInWater()
            && !nearestPed.hasBeenDamagedByWeapon(47)
            && !gPlayerChar.hasBeenDamagedByChar(nearestPed)) {

                session.startSession()

        } else if(globalState.isChatInProgress == true){
                showTextBox("Conversation finished by player")
                session.endSession()
                globalState.currentChatSession = null
        }
    } else {
        gPlayerChar.freezePosition(false)
    }
}

function handleChatWindow(){
    ImGui.BeginFrame("IMGUI_DEMO")
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
let inputIdCounter = genRandomID();

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
            inputIdCounter = genRandomID(); 
        }
    }
}

    
    function printSubtitle(content, color="white") {
        Text.ClearThisPrint("GPT_OUT")
        const colors = {
            blue:"~b~",
            white:"~w~",
            pink:"~p~",
            yellow:"~y~",
            green:"~g~"
        }
        FxtStore.insert("GPT_OUT", colors[color] + content);
        Text.PrintNow("GPT_OUT", 5000, 1);
    }
while (true) 
{
    wait(0)

    // test key
    if(Pad.IsKeyPressed(88)){
        Text.SetFont(0)
        const letters = {
            "í":"¢",
            "ú":"ª",
            "á":"",
            "ó":"¦",
            "é":"",
            "ñ":"®",
            "Ó":"",
            "É":""
        }
        printSubtitle("hola esta     ®  ¦ a¢ e", "pink")

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

