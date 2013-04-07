/**
* jQuery.UI.iPad plugin
* Copyright (c) 2010 Stephen von Takach
* licensed under MIT.
* Date: 27/8/2010
*
* Project Home: 
* http://code.google.com/p/jquery-ui-for-ipad-and-iphone/
*
* Modified: 19/01/2012 
* Organized as a proper plugin and added addTouch() [Josh Gerdes]
*
* Modified: 7 April 2013 by George B. Moody <george@mit.edu>
*  - patched iPadTouchHandler to permit access to virtual keyboard
*  - minor format changes for readability and to please jslint
*/
/*global $, jQuery */
/*jslint white: true, browser: true */

(function($) {
"use strict";
    var lastTap = null, // last tapped element (for double tap detection)
    tapValid = false,	// true for 600ms after tap, when a double tap can occur
    tapTimeout = null,	// timeout reference
    rightClickPending = false,	// true if right click is still feasible
    rightClickEvent,	// the initial event that might be a right click
    holdTimeout = null,	// timeout reference
    cancelMouseUp = false; // prevents a click from occuring as we want the context menu
    
    function cancelTap() {
	tapValid = false;
    }
    
    function cancelHold() {
	if (rightClickPending) {
	    window.clearTimeout(holdTimeout);
	    rightClickPending = false;
	    rightClickEvent = null;
	}
    }
    
    function startHold(event) {
	if (rightClickPending) { return; }
	
	rightClickPending = true; // We could be performing a right click
	rightClickEvent = (event.changedTouches)[0];
	holdTimeout = window.setTimeout("doRightClick();", 800);
    }
    
    function doRightClick() {
	var first = rightClickEvent, simulatedEvent;

	rightClickPending = false;
	
	// First, emulate a mouseup event
	simulatedEvent = document.createEvent("MouseEvent");
	simulatedEvent.initMouseEvent("mouseup", true, true, window, 1,
				      first.screenX, first.screenY,
				      first.clientX, first.clientY,
				      false, false, false, false, 0, null);
	first.target.dispatchEvent(simulatedEvent);
	
	// Emulate a right click
	simulatedEvent = document.createEvent("MouseEvent");
	simulatedEvent.initMouseEvent("mousedown", true, true, window, 1,
				      first.screenX, first.screenY,
				      first.clientX, first.clientY,
				      false, false, false, false, 2, null);
	first.target.dispatchEvent(simulatedEvent);
	
	// Show a context menu
	simulatedEvent = document.createEvent("MouseEvent");
	simulatedEvent.initMouseEvent("contextmenu", true, true, window, 1,
				      first.screenX + 50, first.screenY + 5,
				      first.clientX + 50, first.clientY + 5,
	                              false, false, false, false, 2, null);
	first.target.dispatchEvent(simulatedEvent);
	
	// No mouse up here, but may be added if needed
	cancelMouseUp = true;
	rightClickEvent = null; // Release memory
    }
    
    // mouse over event then mouse down
    function iPadTouchStart(event) {
	var touches = event.changedTouches,
	first = touches[0],
	type = "mouseover",
	simulatedEvent = document.createEvent("MouseEvent");
	
	// Mouse over first - I have live events attached on mouse over
	simulatedEvent.initMouseEvent(type, true, true, window, 1,
				      first.screenX, first.screenY,
				      first.clientX, first.clientY,
	                              false, false, false, false, 0, null);
	first.target.dispatchEvent(simulatedEvent);
	
	type = "mousedown";
	simulatedEvent = document.createEvent("MouseEvent");
	
	simulatedEvent.initMouseEvent(type, true, true, window, 1,
				      first.screenX, first.screenY,
				      first.clientX, first.clientY,
	                              false, false, false, false, 0, null);
	first.target.dispatchEvent(simulatedEvent);
	
	
	if (!tapValid) {
	    lastTap = first.target;
	    tapValid = true;
	    tapTimeout = window.setTimeout("cancelTap();", 600);
	    startHold(event);
	}
	else {
	    window.clearTimeout(tapTimeout);
	    
	    // If a double tap is still a possibility and the elements
	    // are the same, then perform a double click
	    if (first.target === lastTap) {
		lastTap = null;
		tapValid = false;
		
		type = "click";
		simulatedEvent = document.createEvent("MouseEvent");
		
		simulatedEvent.initMouseEvent(type, true, true, window, 1,
					      first.screenX, first.screenY,
					      first.clientX, first.clientY,
	                         	      false, false, false, false,
					      0/*left*/, null);
		first.target.dispatchEvent(simulatedEvent);
		
		type = "dblclick";
		simulatedEvent = document.createEvent("MouseEvent");
		
		simulatedEvent.initMouseEvent(type, true, true, window, 1,
					      first.screenX, first.screenY,
					      first.clientX, first.clientY,
	                         	      false, false, false, false,
					      0/*left*/, null);
		first.target.dispatchEvent(simulatedEvent);
	    }
	    else {
		lastTap = first.target;
		tapValid = true;
		tapTimeout = window.setTimeout("cancelTap();", 600);
		startHold(event);
	    }
	}
    }

    function iPadTouchHandler(event) {
	var first, simulatedEvent, touches, type = "";
	
	if (event.touches.length > 1) { return; }
	
	switch (event.type) {
	case "touchstart":
	    if ($(event.changedTouches[0].target).is("select")) {
		return;
	    }

	    // added 7 Apr 2013 GBM
	    if ($(event.changedTouches[0].target).is("input")) {
		return false; // allow virtual keyboard access for text input
	    }

	    // Trigger two events here to support one touch drag and drop
	    iPadTouchStart(event);
	    event.preventDefault();
	    return false;
	    break;
	    
	case "touchmove":
	    cancelHold();
	    type = "mousemove";
	    event.preventDefault();
	    break;
	    
	case "touchend":
	    if (cancelMouseUp) {
		cancelMouseUp = false;
		event.preventDefault();
		return false;
	    }
	    cancelHold();
	    type = "mouseup";
	    break;
	    
	default:
	    return;
	}
	
	touches = event.changedTouches;
	first = touches[0];
	simulatedEvent = document.createEvent("MouseEvent");
	
	simulatedEvent.initMouseEvent(type, true, true, window, 1,
				      first.screenX, first.screenY,
				      first.clientX, first.clientY,
	                              false, false, false, false, 0, null);
	first.target.dispatchEvent(simulatedEvent);
	
	if (type === "mouseup" && tapValid && first.target === lastTap) {
	    // This emulates the iPad's default behaviour (which we prevented)
	    simulatedEvent = document.createEvent("MouseEvent");
	    // Avoid emulating click on a double tap
	    simulatedEvent.initMouseEvent("click", true, true, window, 1,
					  first.screenX, first.screenY,
					  first.clientX, first.clientY,
					  false, false, false, false, 0, null);
	    first.target.dispatchEvent(simulatedEvent);
	}
    }
    
    $.extend($.support, {
	touch: "ontouchend" in document
    });
    
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
