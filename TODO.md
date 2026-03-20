# TODO

- Ask claude to remove the click to load logic (it has been removed in UI)
--- a/mixxs/js/DeckUI.js
+++ b/mixxs/js/DeckUI.js
@@ -35,6 +35,13 @@ class DeckUI {
       e.target.value = ''; // allow re-selecting the same file
     });
 
+    // Click on the waveform area opens the file picker when no track is loaded
+    // (once a track is loaded, clicks are used for scratch/seek instead)
+    document.getElementById(`waveWrap${n}`)
+      .addEventListener('click', () => {
+        if (!this.deck?.buffer) this._el('file').click();
+      });
+

- On waveform overview, for usable navigation:
  - draw a line under mouse on hover showing the track time at that point
  - when dragging on the overview it must be on mouseup that the playback seeks to the given time
  - it must behave such as when the user drags past/before the overview boudaries the playback seeks to start/end or the track (eg. the hover indicator must be at 0:00 when dragging the overview past it's beginning)
  - the user can cancel the drag by pressing esc

- When using arrow keys in input number, reselect the value after each keystroke (to allow the user to type a new numeric value easily)

- Move desk controls [+] and [-] closer to the speed control

- Fix waveform view in dark mode: the dark/black portions of the waveform are not visible (look at how Mixxx does it)

- Fix time display when speed is 0: it displays `NaN:NaN.NaN / NaN:NaN / Infinity:NaN` and could display eg. `0:32.11 / ∞ / ∞`

- In header, group the volume knob, device display (truncated) and device selection button (click on device display) - and remove the button "⚙ DEVICES"

- Make "click" controls take less space: eg. move the controls to a modal or something

- Make mobile compact view

- Let the user swipe on input numbers to change the value
  - the logic should take a velocity parameter: for loop beats it must be slow, for others it may need to be faster
  - the logic should allow to disable it eg. velocity=0
  - it must be disabled by default, all the controls that have a knob have it disabled
  - so only loop beats input uses it, but oh well

- Implement more filters like in Mixxx (eg. moog filter, bitcrusher, smooth growl, ?)