### VoiceOfCity
-------------

![Texto alternativo](logo.jpg)

This is a mod to interact with peds in game using Generative AI. 
The NPCs are aware of the current weather, time, location, and their own skin attributes, which are used to assign a personality based on their appearance. They can remember conversations (until they disappear due to game limitations), support voice audio generation, and perform actions based on the conversation — such as deciding to leav, attack the player or even follow it.

#### Requirements
- Python 3.5+
- CLEO for VC https://github.com/cleolibrary/III.VC.CLEO/releases/tag/2.1.1
- CLEO Redux https://re.cleo.li/
- ASI Loader & ImGuiRedux https://github.com/user-grinch/ImGuiRedux
- CLEO Audio library for VC: https://github.com/Allegri32/VCIIIAudioLibrary/releases/tag/1.1.1
- Gta Vice City Classic edition

Alternative to a manual installation you can download all the files and put it into the game folder (x86 installation).

#### How to install
* Copy all the content into CLEO mod folder.
* Install python dependences
> pip install -r requirements

#### How to use
- Get a Groq API Key from https://console.groq.com/keys (It's free with a daily rate limit) and add it into VoiceOfCity.ini
- Run the server using:
> python VoiceOfCity_server.py

-   Once in-game press CTR+T near a pedestrian to start a conversation.
-   Uses TAB to focus the text window.

#### Options
- You can change the default language or enable/disable voices from VoiceOfCity.ini file

#### Known issues
Some times ImgRedux plugin doesn't start correctly showing anything, a game restart is needed until the imgui overlay appears correctly.
