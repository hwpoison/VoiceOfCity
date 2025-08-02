import time
import re
import json
import random
import hashlib
import unicodedata
import configparser
from datetime import datetime
from abc import ABC, abstractmethod
import openai
from groq import Groq
from watchfiles import watch, Change

"""
How it works:

The game writes the prompt with the sent message into the INI_FILE then
the server detects this modiication and send the prompt to the model.
Once get a response, write it under the .ini file where will be readed by the mod

"""

GAME_DIR = "D:\\Program Files (x86)\\Grand Theft Auto Vice City"
INI_FILE = f"{GAME_DIR}\\CLEO\\VoiceOfCity.ini"
DEFAULT_INI_SECTION = "PROMPT"

# Uses a "d.mp3" as name because cleo audio extension seems 
# doesn't works using a name with more than 1 character names haha
SPEECH_AUDIO_PATH = f"{GAME_DIR}\\d.mp3" 

# For debug
MOCKET_ANSWERS = False
MOCKED_ANSWER = "hola #call_police#"

class TextToSpeechService(ABC):
    @abstractmethod
    def generate_audio(self, text : str, voice_id : str) -> bool:
        pass

class LLMService(ABC):
    @abstractmethod
    def request_completion(self, chat_history: dict) -> str:
        pass

class PlayAITTS(TextToSpeechService):
    def __init__(self, client, model):
        self.client = client
        self.model = model
        self.voices = {
            "male":[
                    "Chip-PlayAI",
                    "Angelo-PlayAI",
                    "Basil-PlayAI",
                    "Thunder-PlayAI",
                    "Atlas-PlayAI",
            ],
            "female":[
                    "Adelaide-PlayAI",
                    "Arista-PlayAI",
                    "Nia-PlayAI",
                    "Mamaw-PlayAI",
                    "Judy-PlayAI",
                    "Ruby-PlayAI",
            ]
        }

    def get_random_voice(self, sex : str = "male"):
        return random.choice(self.voices[sex])

    def generate_audio(self, text: str, voice_id: str = "Nia-PlayAI") -> bool:
        try:
            response = self.client.audio.speech.create(
                model=self.model,
                voice=voice_id,
                response_format="mp3",
                input=text
            )
            response.write_to_file(SPEECH_AUDIO_PATH)
            print(f"[+] Speech generated: {SPEECH_AUDIO_PATH}")
            return True
        except Exception as e:
            print(f"[!] TTS error: {e}")
            return False

class GroqCompletion(LLMService):
    def __init__(self, api_key : str):
        self.client = Groq(api_key=api_key)

    def request_completion(self, chat_history : dict) -> str:
        chat_completion = self.client.chat.completions.create(
            messages=chat_history,
            model="meta-llama/llama-4-maverick-17b-128e-instruct",
            stream=False,
            max_completion_tokens=30,
            temperature=0.6,
            frequency_penalty=1.0,
        )

        response = chat_completion.choices[0].message
        chat_history.append({
            "role":response.role, 
            "content":response.content
        })

        return response.content

class LocalLLama(LLMService):
    def __init__(self, api_key : str):
        self.client = openai.OpenAI(
            base_url="http://127.0.0.1:8080",
            api_key = api_key
        )

    def request_completion(self, chat_history : dict) -> str:
        chat_completion = self.client.chat.completions.create(
            messages=chat_history,
            model="llama3-70b-8192",
            stream=False,
            max_completion_tokens=30,
            temperature=0.6,
            frequency_penalty=1.0,
        )

        response = chat_completion.choices[0].message
        chat_history.append({
            "role":response.role, 
            "content":response.content
        })

        return response.content

class Chat:
    def __init__(self, llm_service, tts_service):
        self.all_chats = {}
        self.tts_service = tts_service
        self.llm_service = llm_service
        
    def normalize_text(self, text : str) -> str:
        return ''.join(
            c for c in unicodedata.normalize('NFD', text)
            if unicodedata.category(c) != 'Mn'
        ).replace("*", "..").replace('\n', ' ')

    def extract_actions(self, msg):
        # find for any '#...#' pattern in the text, and separates it 
        actions = re.findall(r'#(.*?)#', msg)
        cleaned_message = re.sub(r'#.*?#', '', msg).strip()
        return cleaned_message, actions

    def completion(self, prompt):
        conversation_id = prompt["id"]
        system_prompt = prompt["system_prompt"]
        user_message = prompt["user_message"]
        voice_sex = prompt["sex"]

        print("Received information:", prompt)
        choiced_voice = self.tts_service.get_random_voice(voice_sex)

        # Compose the prompt
        if not self.all_chats.get(conversation_id):
            # New chat
            self.all_chats[conversation_id] = {}
            print(f"[+] New Chat with {conversation_id} started.")
            self.all_chats[conversation_id]["conversation"] = [
                {"role": "system", "content": system_prompt}
            ]
            self.all_chats[conversation_id]["voice"] = choiced_voice
        else:
            # Reanude existent chat
            print(f"[+] Chat continued with existent id {conversation_id}")
            self.all_chats[conversation_id]["conversation"][0] = {"role":"system", "content": system_prompt}
            choiced_voice = self.all_chats[conversation_id]["voice"]

        # add the new message to the historyu
        self.all_chats[conversation_id]["conversation"].append({
            "role": "user",
            "content": user_message
        })

        conversation = self.all_chats[conversation_id]["conversation"]

        print("Current prompt conversation:", conversation)
        if MOCKET_ANSWERS:
            result =   MOCKED_ANSWER
        else:
            result =   self.llm_service.request_completion(conversation)

        print("[+] Model response:", result)
        response, actions = self.extract_actions(result)

        # update the ini
        config = configparser.ConfigParser()
        config.read(INI_FILE)

        config['RESPONSE INFO'] = {
            'content': response,
            'timestamp': str(int(time.time() * 1000)),
            'actions': ";;".join([i for i in actions]) if actions else "",
            "readed":0,
            "voice_audio":0
        }

        if response and int(config["CONFIGURATION"]["ENABLE_VOICES"]):
            if not self.tts_service.generate_audio(response, choiced_voice):
                config["RESPONSE INFO"]["generated_audio"] = "0" # don't talk if there is not generated audio              
            else:
                config["RESPONSE INFO"]["generated_audio"] = "1"

        # save ini info
        with open(INI_FILE, 'w') as configfile:
            config.write(configfile)

class IniWatcher:
    def __init__(self, handler):
        self.last_hash = None
        self.handler = handler

    def read_ini(self):
        config = configparser.ConfigParser()
        config.read(INI_FILE)
        return config

    def read_content_from_ini(self, config):
        if DEFAULT_INI_SECTION not in config:
            raise ValueError(f"Section {DEFAULT_INI_SECTION} not found")

        try:
            count = int(config[DEFAULT_INI_SECTION]["COUNT"])
        except KeyError:
            raise ValueError("There is not chunks under ini file")

        parts = []
        for i in range(count):
            key = f"PART_{i:03}"
            try:
                parts.append(config[DEFAULT_INI_SECTION][key])
            except KeyError:
                raise ValueError(f"PART {key} didnt found in {DEFAULT_INI_SECTION}")

        return ''.join(parts)

    def hash_value(self, value):
        return hashlib.md5(value.encode()).hexdigest() if value else None

    def on_modified(self, path):
        if not path.endswith(INI_FILE):
            return
        config = self.read_ini()

        try:
            ini_content = self.read_content_from_ini(config)
        except Exception as e:
            print(f"[ERROR] Failed to read the prompt content: {e}")
            return

        current_hash = self.hash_value(ini_content)
        if current_hash != self.last_hash:
            self.last_trigger = time.time()
            try:
                print("[+] New request  ", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

                # Extract the incoming game json content
                ini_json = json.loads(ini_content)
                self.handler(ini_json)

            except Exception as e:
                print(f"[ERROR] Request fallido: {e}")
            self.last_hash = current_hash

if __name__ == "__main__":
    config = configparser.ConfigParser()
    config.read(INI_FILE)
    api_key = config["CONFIGURATION"]["api_key"]

    # For local llamacpp-server
    #service = LocalLLama(api_key=api_key)

    # For Groq Cloud service ( https://console.groq.com/playground )
    service = GroqCompletion(api_key=api_key)

    chat_handler = Chat(
        llm_service=service,
        tts_service=PlayAITTS(
            service.client, 
            "playai-tts"
        )
    )

    iniWatcher = IniWatcher(handler=chat_handler.completion)

    last_trigger = time.time()

    # Monitoring the ini file for any change
    def start_watcher():
        global last_trigger
        for changes in watch(INI_FILE):
            for change, path in changes:
                now = time.time()
                if change == Change.modified and (now - last_trigger) > 1.0:
                    last_trigger = now
                    iniWatcher.on_modified(path)

    print(f"[+] VoicesOfCity v1.0 started.")
    print(f"[+] Watching the '{INI_FILE}' file for changes.")
    start_watcher()
