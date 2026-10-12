# Installing Companion (friends alpha, build 0.1.0)

**Draft for the founder to review.** It is accurate for what the build does today. Companion is an early build: it finds what is wrong in the project you are building, points at it, fixes it with you and checks that it works.

## What you need
- A Mac with Apple Silicon (M1 or newer). Intel Macs are not supported yet.
- macOS 14 or newer. It has only been tried on macOS 27 so far, so tell me if something is odd on yours.
- **Node** and **Git** installed (Companion checks this on first run and tells you what is missing).
- **Your own Claude API key** with a little credit on it, from console.anthropic.com. Companion never pays for Claude and never sees your claude.ai login. What it costs depends on how much you use it; the first real figures will come from this alpha, so watch your usage on the Anthropic page the first days.

## Install
1. Open `Companion-0.1.0.dmg` and drag **Companion** onto **Applications**.
2. Open Companion from Applications. It has no Dock icon: look for the small character at the edge of your screen.
3. **If macOS says it cannot check the app for malware** (the first builds are not yet notarized by Apple): open **System Settings, Privacy & Security**, scroll down, and press **Open Anyway** next to Companion, then open it again. This is needed once.
4. Follow the first run: paste your key (it goes straight into your Keychain), choose your project folder, and try the first task.

## What it asks for, and when
Companion asks for each permission **only the first time you use the feature that needs it**, and says why first:
- **Screen Recording**: when you press the key and it needs to look at your screen once.
- **Accessibility**: to find the exact button or line, and to click it only if you press Do it for me.
- **Microphone**: when you hold the talk keys. It listens only while you hold them.
You can see and change all three in **Settings** on the card.

## The keys
Hold **Control + Option + Command** and press:
- **F**: find what is wrong in your project and point at it.
- **S**: ask about something on your screen (it looks once, with a light first).
- **V** (hold): talk.
- **K**: open the ask box. **X**: stop everything, always.

## If something goes wrong
- **Settings, Save a log for support** writes a text file in your Downloads folder. It holds no project content, nothing you typed or said and nothing from your screen. Send it to me.
- **Settings, Delete everything** removes everything Companion keeps on your Mac, including your saved key, and can also remove Companion's own notes inside your projects. Your own files are never touched.
- Quitting Companion: the Companion icon in the menu bar, then Quit.

## What it does not do yet
No updater (I will send you each new version), no Windows, and the character is a plain dot for now.
