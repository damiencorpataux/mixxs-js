# TODO

- Update README: `### ✨ [Try it here !](https://www.mien.ch/mixxs-js/mixxs/)`

- Remove export feature (it doesn't work the expected way and is not a must have)

- Restore track time display - and update it to elapsed (mm:ss.dd), remaining (mm:ss), total (mm:ss)

- Fix the font used for displaying numbers: the 0,2,3,6,8,9 look too similar and the dot width is too small to be clearly visible

- Fix waveform playhead position is wrong when sliding the speed knob (going to 0 even bring playhead to the very start of the track)

- Fix audible click on play/pause/stop/cue/drag: use a helper that makes a quick fade in/out on playback start/stop

- Fix waveform views sync: they must be always be at same "speed" (relative speed = 0)

- Fix waveform views dragging using mouse (imprecise at slow drag speed)

- Fix stop button click by accident: remove the button, or ask user confirmation on click on stop desk ?

- Prevent right-click (contextual menu): it messes up the knob pressed state

- In header, group the volume knob, device display (truncated) and device selection button (click on device display) - and remove the button "⚙ DEVICES"

- Knobs bg in light mode: `--knob-body: #e4e4e4;` in `style.css`

- Make "click" controls take less space: eg. move the controls to a modal or something