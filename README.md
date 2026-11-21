# Signal Relay

Signal Relay is a 45-second booth game for two players at one screen. Each player controls one of two rings. Open a path between the center and the marked lane by lining up both gaps at the same time. Each signal adds one point and sets a new target. Play another round on the same sequence to see if you can beat your score.

| Station | Left turn | Right turn |
| --- | --- | --- |
| Inner ring | A | D |
| Outer ring | J | L |

The on-screen arrows work with a pointer or touchscreen. Sound is optional and off by default. The rings have different gap markers, the target lane is numbered, and the current gaps are announced for screen-reader users.

## Play locally

From this directory, run `python3 -m http.server 8000 --bind 127.0.0.1` and open [localhost:8000](http://127.0.0.1:8000/) in a modern browser. The game runs entirely in the browser with no network calls or accounts.

## Test and package

Run `node --test engine.test.mjs` to check scoring, two-player input, solvability and the timer. Run `python3 build_release.py signal-relay.zip` to build a byte-reproducible ZIP with the playable game and source. Extract the ZIP and serve the extracted directory the same way.

The game uses original code, graphics, and synthesized tones. AI coding agents assisted implementation and testing.

## Development tools

The game source and release exporter were formatted with JetBrains PyCharm 2026.3.0.1. After formatting, the engine tests and browser smoke test were run again.

[Play the hosted build](https://shanjiaming.github.io/signal-relay/)
