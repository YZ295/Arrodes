# Arrodes Design System

## Direction

“Precision Workspace / 精密工作台” is a dense, calm Operate surface. Familiarity, task completion, clear state, and reliable interaction outrank spectacle.

## Foundations

- Surfaces: deep neutral app base, opaque cool-charcoal navigation, slate working canvas, and solid elevated controls.
- Accent: restrained blue for primary actions, selection, and active state. Green, amber, and red are semantic only.
- Type: Chinese-first system sans. Metadata 12px, controls 13–14px, body 15px, headings 18–20px. Monospace is reserved for paths, identifiers, and code.
- Shape: controls 8–10px, panels 14px, composer 20px. Hairline borders establish grouping before shadows.
- Motion: 160–220ms state feedback only. Reduced-motion removes repeated and spatial movement.

## Layout

The desktop navigation is 272px expanded and 68px compact. Below 720px it becomes compact automatically so the conversation and composer remain usable. Drawers are at most 500px on desktop and fill available width on narrow screens. The composer stays bottom-centered with project/mode/permission controls left and model/actions/voice right.

## Interaction

StatusBar is the single owner of connection, speaking, application-error, TTS-error, and wake-listening presentation; navigation does not repeat these states. Unavailable destinations stay out of primary navigation until they work. Canvas is a workspace view rather than a separate top-level destination: users enter it from Workspace and return there. The global focus foundation provides a blue `focus-visible` ring. Navigation, status, and composer buttons use a 44px minimum height on narrow screens. Wallpaper remains behind opaque or blurred working surfaces; personalized wallpapers still require visual contrast review.

On narrow screens, the compact rail can open an overlay containing the existing conversation search, history, and new-conversation controls. The backdrop dismisses this overlay without changing the active conversation.

## Desktop companion

The desktop companion extends the same precision-workbench world into a 420×600 transparent projection surface. A clearly adult, silver-white-haired original anime character in a tailored navy-and-white academy-inspired uniform occupies the right and lower silhouette; one opaque cool-charcoal speech panel sits at the upper left so status remains readable over arbitrary desktop content. The direction is capable, clean, and approachable, using restrained cinematic light rather than ornamental cuteness. Reference images may guide only broad palette and mood: face, silhouette, hair construction, clothing, accessories, and pose must be substantively redesigned for commercial use. It shows one state and at most one next action, uses amber for uncertainty, and never turns model confidence into decorative charts. The window is passive and mouse-through by default; configuration remains in the main application.
