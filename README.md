# Final Project - Space Wars Game

## 📹 Demo Video

[![Watch the video](/public/images/space-wars.png)](https://www.loom.com/share/e9dc9da5ce734a14bb52c8cb45da0357?sid=c7584010-8942-497b-a407-b04fca0b36d2)

## 📋 Summary

Space Wars is basically your chance to blast your friends in space! 🚀 It's a multiplayer space shooter built with WebGL.

## 🎯 Why I Built This

I was stuck choosing between a million artsy projects, then it hit me - SPACE BATTLES! 💥 Games are challenging to build (great for my github!), and now I can destroy my friends in epic space combat while learning advanced WebGL tricks.

## 🎨 Where I Chose My Assets

I'm not an artist and I don't know Blender or similar 3D tools, so I asked ChatGPT for a low‑poly spaceship from [Quaternius' Ultimate Spaceships](https://quaternius.com/packs/ultimatespaceships.html) and picked a matching, efficient HDRI for lighting from [Poly Haven — Studio Small 08](https://polyhaven.com/a/studio_small_08).
To keep it efficient, I compressed the model with [glTF.report](https://gltf.report/), use [Draco](https://google.github.io/draco/) loader for geometry, and ran textures through [TinyPNG](https://tinypng.com/) just to be extra safe.

## 💡 Why I Chose an HDRI Over a Regular Light

I first considered an ambient + directional light to get sun‑style shadows on planets. Then I pivoted toward making this a multiplayer game and decided to prioritize performance and fun.

In space, light doesn’t bounce around like it does on Earth, so one fake “sun” with soft shadows can look a bit weird unless you go all‑in on realism—which is slow. Shadows are also pricey to render. To keep the game fast on more devices, I used a high‑quality sky image for lighting (Poly Haven — Studio Small 08). It gives nice, believable highlights and reflections without the heavy shadow cost.

cleaner look, fewer moving parts, and more headroom for multiplayer.

## 🪐 The Basics I Got Right

Correct handling of colorspace, tone mapping, dpr, antialiasing, resize, side of the material, minimal ui, debugging tools etc.

## 🧠 And A Little More Complex Stuff

Starship movement, camera follow-up, plenty of bullets from every player, multiplayer via WebSockets, health, hitboxes, respawning, collisions with bullets, postprocessing effect when getting damaged, gsap effect when fire, numerous settings that may seem insignificant but add up over time, a shader-based star field that runs in the browser, and a danger zone that activates when players fly beyond the stars.

## 🔗 Links

- **Frontend Repository**: https://github.com/fdgbatarse1/space-wars
- **Backend Repository**: https://github.com/fdgbatarse1/space-wars-backend
- **Live Server**: https://space-wars-backend.onrender.com
- **Live Demo**: https://space-wars-pi.vercel.app/
