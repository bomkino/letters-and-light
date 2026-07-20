# Privacy boundary

Letters & Light is local-first by construction.

## What the browser reads

- answers you choose;
- specimen copy you type;
- an image you explicitly paste, drop or select;
- a saved Letters & Light project you explicitly open.

## What leaves the browser

Nothing from those inputs is sent by the application. Runtime source contains no `fetch`, `XMLHttpRequest`, beacon, WebSocket or EventSource primitive. Hosting still serves the application files and therefore receives ordinary web-server request metadata; the product itself adds no analytics.

## Images

The image is decoded and sampled locally. The original filename, original bytes and working RGBA pixels are not serialized into project files. A working-pixel SHA-256 is retained so the tool can recognize whether later color work came from the same normalized source.

## Persistence

Browser persistence is off until a person opts in. Clearing remembered work removes the project from local storage. Downloaded exports are ordinary local files under the person’s control.

## External links

Font-source and pitch.dog links open only when activated. Following them is a separate browser request governed by the destination.
