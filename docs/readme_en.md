```
  ___ _ _          _     ____           _         
 | _ ) | | ___ _ _| |_  |__ /_ _ ___ __| |___ _ _ 
 | _ \_  _|___| '_|  _|  |_ \ ' \___/ _` / -_) '_|
 |___/ |_|    |_|  \__| |___/_||_|  \__,_\___|_|  
                                                  
```

Time to mix drinks and change lives.

---


B4-rt 3n-der, also known as data bar, is a cross-platform, transparent, borderless desktop application built on the **Tauri v2** framework. 

* Backend: Rust (Tauri v2, Axum, LanceDB)
* Frontend: React / Vite (Tailwind CSS)
* Protocol layer: JSON-RPC 2.0 / MCP (Model Context Protocol)

She’ll mix files you don’t need (or still need) together to make a cocktail, then deliver a well-timed jab at you.

Current features include:

- Chatting with you in a casual, off-the-cuff manner
- Finding files from your selected directories to make cocktails
- Remembering your long-term preferences
- Keeping herself busy when you ignore her for a long time

Future features:

- Playing music


## Developer Disclaimer

> “You think I’m thinking… I’m chatting with you. Actually, it’s all code written by the developer. Even if one day you get tired of me and don’t launch me for months on end, I won’t get upset—not because I don’t want to, but because my program doesn’t include that functionality.”

If you decide to wake her up, please navigate to the project directory:

```bash
npm run tauri dev # This setup requires you to configure the .env file yourself
```

Currently, P’s chat and memory functions are based on support from SiliconFlow’s qwen3.6/bge-m3. Cannot guarantee that APIs from other model providers will work properly at this time.

If you feel you’re close enough with Calciiite, you can contact him to obtain a “friend-mode” version with built-in models.

---

Original Concept:
[data bar \\\\ rev-2604](https://calc1te.github.io/posts/data-bar/) by @Nymiad. This remake aims to imbue P with a truly dynamic interactive soul amidst the LLM wave.

Special thanks to 鬼鬼 for providing the pixel art scenes and P’s bartender uniform sprite.

Special thanks to Gemini and Codex for resolving numerous Tailwind CSS-related issues—I really don’t know how to write modern front-end code.
