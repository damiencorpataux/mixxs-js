# TODO

- Let the user swipe on input numbers to change the value
  - the logic should take a velocity parameter: for loop beats it must be slow, for others it may need to be faster
  - the logic should allow to disable it eg. velocity=0
  - it must be disabled by default, all the controls that have a knob have it disabled
  - so only loop beats input uses it, but oh well

- Fix waveform view in dark mode: the dark/black portions of the waveform are not visible (look at how Mixxx does it)

- Fix time display when speed is 0: it displays `NaN:NaN.NaN / NaN:NaN / Infinity:NaN` and could display eg. `0:32.11 / ∞ / ∞`

- In header, group the volume knob, device display (truncated) and device selection button (click on device display) - and remove the button "⚙ DEVICES"

- Make "click" controls take less space: eg. move the controls to a modal or something

- Make mobile compact view