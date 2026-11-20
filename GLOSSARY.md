# Silicon Seeds

Local-first generative media studio for orchestrating image, video, speech, and multi-model music/audio workflows through ComfyUI and TTS engines.

## Language

**ABC Score**:
Symbolic text notation of musical meter, key, chords, and notes used as an intermediate structural plan before audio synthesis.
_Avoid_: MIDI Roll, Sheet Music

**Audio Model**:
A generative audio backbone with distinct capabilities, duration bounds, and conditioning inputs (`ace-step-1.5`, `yue2`, `minimax-music-3`, `stable-audio-3`).
_Avoid_: Audio Engine, Synth Backend, `sa3`

**Keyframe Guide**:
A reference image pinned to a specific frame index (`frameIdx`, where `-1` denotes the final frame) along the video timeline via a chained `MiniMaxH3AddGuide` node, anchoring the visual state of the generated video at that frame.
_Avoid_: Guide Node, Control Frame
_Considered_: Timeline Pin, Control Image

**Melody Cover**:
Generation of a new musical arrangement and vocal or instrumental performance whose melody follows an uploaded Reference Audio file.
_Avoid_: Audio-to-Audio, Stem Remix, Voice Clone
_Considered_: Music Cover

**Reference Audio**:
A user-uploaded audio recording supplied to guide melody extraction in a Melody Cover.
_Avoid_: Prompt Audio, Seed Track, Guide Stem

**Reference Image**:
A numbered visual source (`<Picture 1>` through `<Picture 9>`) supplied alongside a video prompt to define recurring characters, objects, or environments across shots.
_Avoid_: `ref_image`, Subject Slot, IP-Adapter Image
_Considered_: Character Sheet

**Reprompting**:
Optional expansion of a short text prompt into a detailed sonic description by an auxiliary language model inside the audio workflow before diffusion sampling.
_Avoid_: Prompt Enhancement

**Soundscape**:
The natural ambient and Foley audio description embedded into a MiniMax H3 prompt (`Soundscape:` / `Audio:` cues) to condition the joint stereo audio-video diffusion stream.
_Avoid_: Ambient Track, SFX Prompt, Audio Bed

**Sound Preset**:
A named, reusable bundle of genre/timbre prompt text, optional lyric scaffold, and recommended model parameters for audio generation, either built-in or user-defined.
_Avoid_: Audio Style Preset, Genre Tag, Vibe Preset
_Considered_: Audio Preset

**Style Preset**:
A named visual aesthetic direction (`cyberpunk`, `noir`, or user-defined) applied to image and video generation prompts.
_Avoid_: Visual Preset, Theme

**Style Embedding**:
An optional MiniMax H3 visual style token file (`models/embeddings/minimaxh3_*.safetensors`, such as anime, pixel art, or oil painting) referenced via `<style:name>` in the positive prompt. Distinct from a text-only **Style Preset**.
_Avoid_: Style Model, Style LoRA, Visual Preset

**Underscore**:
Instrumental background music generated for a Compose video job to accompany narrated speech without competing vocals.
_Avoid_: Backing Track, BGM, Instrumental Stem

**Video Model**:
A selectable generative video backbone in the studio catalog (`wan2.2`, `ltx2.3`, `minimax-h3`), each offering distinct motion, native audio, duration, and visual conditioning capabilities.
_Avoid_: UNET, Diffusion Checkpoint, Video Backend
_Considered_: Video Engine

**Video Sequence**:
An ordered multi-clip video generation job whose clips are joined either by generated visual transitions or by frame-by-frame continuation from the preceding clip.
_Avoid_: Concat Pipeline, Multi-Prompt Batch
_Considered_: Storyboard

