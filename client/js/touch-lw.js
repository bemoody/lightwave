// minimal touch interface code for LightWAVE
//  supports (left) mousedown, mousemove, mouseup only
//  based on jQuery.ui.touch.js by Stephen von Takach, plugin version by Josh
//  Gerdes, patched by George B. Moody.

/*global $, jQuery */
/*jslint white: true, browser: true */

(function($) {
"use strict";

function sim_event(event, type) {
    var sim = document.createEvent("MouseEvent"),
        touch = event.changedTouches[0];

    sim.initMouseEvent(type, true, true, window, 1,
		       touch.screenX, touch.screenY,
		       touch.clientX, touch.clientY,
	               false, false, false, false, 0, null);
    touch.target.dispatchEvent(sim);
}

function iPadTouchHandler(event) {
    if (event.touches.length > 1) { return; }
    switch (event.type) {
    case "touchstart":
	if ($(target).is("select")) { return; }
	// allow virtual keyboard access for text input
	if ($(target).is("input")) { return false; }
	sim_event(event, "mousedown");
	break;
    case "touchmove":
	event.preventDefault();
	sim_event(event, "mousemove");
	break;
    case "touchend":
	sim_event(event, "mouseup");
	break;
    default:
	return;
    }
}
    
$.extend($.support, { touch: "ontouchend" in document });
    
$.fn.addTouch = function() {
    if ($.support.touch) {
        this.each(function(i,el){
            el.addEventListener("touchstart", iPadTouchHandler, false);
            el.addEventListener("touchmove", iPadTouchHandler, false);
            el.addEventListener("touchend", iPadTouchHandler, false);
            el.addEventListener("touchcancel", iPadTouchHandler, false);
        });
    }
};

})(jQuery);
