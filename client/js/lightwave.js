// file: lightwave.js	G. Moody	18 November 2012
//			Last revised:	 4 February 2013  version 0.40
// LightWAVE Javascript code
//
// Copyright (C) 2012-2013 George B. Moody
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License as
// published by the Free Software Foundation; either version 2 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, write to the Free Software
// Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA
// 02111-1307, USA.
//
// You may contact the author by e-mail (george@mit.edu) or postal
// mail (MIT Room E25-505A, Cambridge, MA 02139 USA).  For updates to
// this software, please visit PhysioNet (http://physionet.org/).
// ____________________________________________________________________________
//
// LightWAVE is a lightweight waveform and annotation viewer and editor.
//
// LightWAVE is modelled on WAVE, an X11/XView application I wrote and
// maintained between 1989 and 2012.  LightWAVE runs within any modern
// web browser and does not require installation on the user's computer.
//
// This file contains Javascript code that runs within the user's browser
// to respond to his or her input and retrieve data via AJAX, using jQuery
// 1.7 or later.  On the server end, the AJAX requests are handled by
// '/cgi-bin/lightwave', the LightWAVE CGI application.
// ____________________________________________________________________________

// server is the first part of every AJAX request.  Change it if you are
// not using the public LightWAVE server.
var server = 'http://physionet.org/cgi-bin/lightwave';

var url;	// request sent to server (server + request-specific string)
var db = '';	// name of the selected database
var record = '';// name of the selected record
var recinfo;    // metadata for the selected record, initialized by slist()
var tickfreq;      // ticks per second (LCM of sampling frequencies of signals)
var adt_ticks;  // length of longest annotation set, in ticks
var sdt_ticks;  // length of signals, in ticks
var rdt_ticks;		// record length, in ticks (max of adt_ticks and sdt_ticks)
var ann_set = ''; // annotators for the selected database, from alist()
var ann = [];   // annotations read and cached by read_annotations()
var nann = 0;	// number of annotators, set by read_annotations()
var annselected = '';// name of annotator to be highlighted, if any
var signals;    // signals for the selected record, from slist()
var nsig = 0;	// number of signals, set by read_signals()
var sigselected = '';// name of signal to be highlighted, if any
var current_tab; // name of the currently selected tab
var dt_sec = 10;    // window width in seconds
var dt_ticks;    // window width in ticks
var t0_ticks = -1;   // time of the first sample in the signal window, in ticks
var tf_ticks;	// time of the first sample after the signal window, in ticks
var tpool = []; // cache of 'trace' objects (10-second signal segments)
var tid = 0;	// next trace id (all traces have id < tid)
var target = '';// search target, set in Find... dialog
var atarget = '';// annotator to be searched, set in Find... dialog
var g_visible = 1; // visibility flag for grid (1: on, 0: off)
var m_visible = 1; // visibility flag for annotation marker bars (1: on, 0: off)
var a_visible = []; // visibility flags for annotators
var s_visible = []; // visibility flags for signals
var x_cursor = 0;  // SVG cursor x-coordinate (see show_time())
var mag = [];   // magnification of signals in plots
var help_main = 'about.html'; // initial and main help topic
var svc = '';   // SVG code to draw the cursor (see show_time())
var svg = '';   // SVG code to draw the signal window (see show_plot())

// Initialize or expand tpool
function init_tpool(ntrace) {
    for (var i = tpool.length; i < ntrace; i++) {
	tpool[i] = {};
	tpool[i].id = tid++;
    }
}

// Replace the least-recently-used trace with the contents of s
function set_trace(db, record, s) {
    var idmin = tid, imin, j, len, ni, p, v, vmean, vmid, vmax, vmin, w;

    // set properties of s that are not properties from server response
    s.id = tid++;
    s.db = db;
    s.record = record;
    s.dt_sec = dt_sec;

    // restore amplitudes from first differences sent by server
    len = s.samp.length;
    v = s.samp;
    vmean = vmax = vmin = v[0];
    for (j = ni = p = 0; j < len; j++) {
	p = v[j] += p;
	if (p == -32768) ni++;  // invalid sample: don't count it
	else {
	    if (p > vmax) vmax = p;
	    else if (p < vmin) vmin = p;
	    vmean += +p;
	}
    }

    // calculate the local baseline (a weighted sum of mid-range and mean)
    vmean /= len - ni;
    vmid = (vmax + vmin)/2;
    if (vmid > vmean) w = (vmid - vmean)/(vmax - vmean);
    else if (vmid < vmean) w = (vmean - vmid)/(vmean - vmin);
    else w = 1;
    s.zbase = vmid + w*(vmean - vmin);

    // find the least-recently-used trace
    for (var i = 0; i < tpool.length; i++) {
	if (tpool[i].id < idmin) {
	    imin = i;
	    idmin = tpool[i].id;
	}
    }
    tpool[imin] = s; // replace it
}

// Find a trace in the cache
function find_trace(db, record, signame, t) {
    for (var i = 0; i < tpool.length; i++) {
	if (tpool[i].name == signame &&
	    tpool[i].t0 == t &&
	    tpool[i].record == record &&
	    tpool[i].db == db &&
	    tpool[i].dt_sec >= dt_sec) {
	    return tpool[i];
	}
    }
    return null;
}

// Convert argument (in samples) to a string in HH:MM:SS format.
function timstr(t) {
    var ss = Math.floor(t/tickfreq);
    var mm  = Math.floor(ss/60);    ss %= 60;
    var hh  = Math.floor(mm/60);    mm %= 60;
    if (ss < 10) ss = '0' + ss;
    if (mm < 10) mm = '0' + mm;
    if (hh < 10) hh = '0' + hh;
    var tstring = hh + ':' +  mm + ':' + ss;
    return tstring;
}

// Convert argument (in samples) to a string in HH:MM:SS.mmm format.
function mstimstr(t) {
    var mmm = Math.floor(1000*t/tickfreq) % 1000;
    if (mmm < 100) {
	if (mmm < 10) mmm = '.00' + mmm;
	else mmm = '.0' + mmm;
    }
    else mmm = '.' + mmm;
    var tstring = timstr(t) + mmm;
    return tstring;
}

// Convert string argument to time in samples.
function strtim(s) {
    var c = s.split(":");
    var t;
    switch (c.length) {
      case 1: if (c[0] == "") t = 0;
	else t = +c[0]; break;
      case 2: t = 60*c[0] + +c[1]; break;
      case 3: t = 3600*c[0] + 60*c[1] + +c[2]; break;
      default: t = 0;
    }
    return t*tickfreq;
}

function html_escape(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function show_summary() {
    var itext = '', ia, ii, is, rdurstr;

    if (recinfo.duration) sdt_ticks = strtim(recinfo.duration);
    else sdt_ticks = 0;
    rdt_ticks = (adt_ticks > sdt_ticks) ? adt_ticks : sdt_ticks;
    rdurstr = timstr(rdt_ticks);
    itext += '<h3>Summary</h3>\n<table>\n'
        + ' <tr><td>Record length</td><td>' + rdurstr + '</td></tr>\n';
    if (recinfo.start) {
	itext += ' <tr><td>Start</td><td>' + recinfo.start + '</td></tr>\n';
//	    + ' <tr><td>End</td><td>' + recinfo.end + '</td></tr>\n';
    }
    itext += ' <tr><td>Clock frequency&nbsp;</td><td>' + tickfreq
	+ ' ticks per second</td></tr>\n';

    if (nann > 0) {
	for (ia = 0; ia < nann; ia++) {
	    itext += '<tr><td>Annotator: ' + ann[ia].name + '</td><td>'
		+ '(' + ann[ia].annotation.length + ' annotations)</td></tr>\n';
	}
    }
    if (signals) {
	for (is = 0; is < nsig; is++) {
	    itext += '<tr><td>Signal: ' + signals[is].name + '</td><td>';
	    if (signals[is].tps == 1)
		itext += signals[is].tps + ' tick per sample; ';
	    else
		itext += signals[is].tps + ' ticks per sample; ';
	    itext += signals[is].gain + ' adu/';
	    if (signals[is].units)
		itext += signals[is].units + '; ';
	    else
		itext += 'mV; ';
	    itext +=  signals[is].adcres + '-bit ADC, zero at '
		+ signals[is].adczero + ';  baseline is '
		+ signals[is].baseline + '</td></tr>\n';
	}
    }
    if (recinfo.note) {
	itext += '<tr><td style="vertical-align: top;">Notes:</td><td><pre>';
	for (ii = 0; ii < recinfo.note.length; ii++) {
	    itext += html_escape(recinfo.note[ii]) + '\n';
	}
	itext += '</pre></td></tr>\n';
    }
    itext += '</table>';
    $('#info').html(itext);
}

function show_tables() {
    var atext = '', stext = '', ia, is;

    if ($('#viewann').prop('checked')) {
        if (ann.length > 0) 
		atext += '<h3>Annotations</h3>\n';
	for (ia = 0; ia < nann; ia++) {
	    if (a_visible[ann[ia].name] == 0) {
		atext += '<p>Annotator: ' + ann[ia].name + ' [hidden]</br>\n';
	    }
	    else {
		var a = ann[ia].annotation;
		atext += '<p><b>Annotator:</b> ' + ann[ia].name
		    + ' (' + a.length + ' annotations)<br>\n';
		atext += '<p><table class="dtable">\n<tr>'
		    + '<th>Time (elapsed)&nbsp;</th><th>Type</th>'
		    + '<th>Sub&nbsp;</th><th>Chan</th><th>Num&nbsp;</th>'
		    + '<th>Aux</th></tr>\n';
		for (var i = 0; i < a.length; i++) {
		    if (a[i].t < t0_ticks) continue;
		    else if (a[i].t > tf_ticks) break;
		    atext += '<tr><td>' + mstimstr(a[i].t) + '</td><td>'
			+ a[i].a + '</td><td>' + a[i].s + '</td><td>'
			+ a[i].c + '</td><td>' + a[i].n + '</td><td>';
		    if (a[i].x) { atext += a[i].x; }
		    atext +=  '</td></tr>\n';
		}
		atext += '</table>\n</div></div>\n';
		atext += '</table>\n<p>\n';
	    }
	}
	atext += '<hr>\n';
	$('#anndata').html(atext);
    }
    else
	$('#anndata').empty();

    if ($('#viewsig').attr('checked')) {
	if (signals) {
	    var sig = [];
	    for (i = is = 0; i < signals.length; i++) {
		var sname = signals[i].name;
		if (s_visible[sname])
		    sig[is++] = find_trace(db, record, sname, t0_ticks);
	    }
	    
	    stext = '<h3>Signals</h3>\n<p><table class="dtable">\n'
		+ '<tr><th>Time (elapsed)&nbsp;</th>';
	    for (i = 0; i < is; i++)
		stext += '<th>' + sig[i].name + '&nbsp;</th>';
	    stext += '\n<tr><th></th>';
	    for (i = 0; i < is; i++) {
		u = sig[i].units;
		if (!u) u = '[mV]';
		stext += '<th><i>(' + u + ')</i></th>';
	    }

	    var t = t0_ticks;
	    for (var i = 0; t < tf_ticks; i++, t++) {
		stext += '</tr>\n<tr><td>' + mstimstr(t);
		for (var j = 0; j < is; j++) {
		    stext += '</td><td>';
		    if (t%sig[j].tps == 0) {
			var vi = sig[j].samp[i/sig[j].tps];
			if (vi == -32768) stext += '-';
			else {
			    v = (vi - sig[j].base)/ sig[j].gain;
			    stext += v.toFixed(3);
			}
		    }
		}
		stext += '</td>';
	    }
	    stext += '</tr>\n</table>\n';
	}
	$('#sigdata').html(stext);
    }
    else
	$('#sigdata').empty();
}

var tracking = false;

function toggle_edit() {
    var btext;

    tracking = !tracking;
    if (!tracking) $('#editdata').empty();

    $('svg').mousemove(function(e){
	if (tracking) {
	    var x = e.pageX;
	    show_time(x);
	}
    });
}

function handle_svg_events() {
    $('svg').mousemove(function(e){
	if (tracking) {
	    var x = e.pageX;
	    show_time(x);
	}
    });

    $('#grid').click(function(event){ g_visible = 1 - g_visible; show_plot();});
    $('#mrkr').click(function(event){ m_visible = 1 - m_visible; show_plot();});

    $("[id^='ann;;']").click(function(event){
	var aname = $(this).attr('id').split(";")[2];
	if (a_visible[aname] == 0) {
	    a_visible[aname] = 1;
	    annselected = aname;
	}
	else if (annselected == aname) {
	    annselected = '';
	}
	else {
	    a_visible[aname] = 0;
	}
	show_plot();
    });

    $("[id^='sig;;']").click(function(event){
	var sname = $(this).attr('id').split(";")[2];
	if (s_visible[sname] == 0) {
	    s_visible[sname] = 1;
	    sigselected = sname;
	    $('.stretch').removeAttr('disabled');
	    $('.reset').removeAttr('disabled');
	    $('.shrink').removeAttr('disabled');
	}
	else if (sigselected == sname) {
	    sigselected = '';
	    $('.stretch').attr('disabled', 'disabled');
	    $('.reset').attr('disabled', 'disabled');
	    $('.shrink').attr('disabled', 'disabled');
	}
	else {
	    s_visible[sname] = 0;
	}
	read_signals(t0_ticks, true);
	show_plot();
    });
}

var width, height, swl, sww, swr;  // View/edit graphics dimensions, in pixels
var svgw = 1000*dt_sec, svgh = svgw/2; // Grid dimensions, in (arbitrary) SVG coords
var svgl = svgw/8;	  	   // Left column width, in SVG coords
var svgr = svgw/24;		   // Right column width, in SVG coords
var svgt = 12*dt_sec;		   // Top margin in SVG coords (y-translation)
var svgtw = svgl + svgw + svgr;    // Total available width in SVG coords
var svgf = 12*dt_sec;		   // font-size for signal/annotation labels
var svgtf = 10*dt_sec;		   // Small font-size for timestamps
var svgc = 5*dt_sec;		   // Size for small elements (circles, etc.)
var adx1 = 2*dt_sec;
var adx2 = 4*dt_sec;
var adx4 = 8*dt_sec;
var ady1 = 10*dt_sec;
var ady2 = 20*dt_sec;

function set_sw_width(seconds) {
    dt_sec = seconds;
    svgw = 1000*dt_sec;
    svgh = svgw/2;
    svgl = svgw/8;
    svgr = svgw/24;
    svgtw = svgl + svgw + svgr;
    svgf = 12*dt_sec;
    svgtf = 10*dt_sec;
    svgc = 5*dt_sec;
    adx1 = 2*dt_sec;
    adx2 = 4*dt_sec;
    adx4 = 8*dt_sec;
    ady1 = 10*dt_sec;
    ady2 = 20*dt_sec;
}

function show_plot() {
    width = $('#plotdata').width();  // total available width in View/edit panel
    swl = Math.round(width*svgl/svgtw);    // left column width
    sww = Math.round(width*svgw/svgtw);   // signal window width
    swr = width - (swl + sww);	     // right column width
    height = Math.round(0.55*sww);   // signal window height

    // calculate baselines for signals and annotators
    var dy = Math.round(svgh/(nsig + nann + 1));
    var y = dy;
    var y0s = [];	// signal baselines
    var y0a = [];	// annotator baselines
    var ia = 0, is = 0;
    while (is < nsig || ia < nann) {
	if (is < nsig) { y0s[is] = y; y += dy; is++; }
	if (ia < nann) { y0a[ia] = y; y += dy; ia++; }
    }

    svg = '<br><svg xmlns=\'http://www.w3.org/2000/svg\''
	+ ' xmlns:xlink=\'http:/www.w3.org/1999/xlink\' class="svgplot"'
	+ ' width="' + width + '" height="' + height
	+ '" preserveAspectRatio="xMidYMid meet">\n';
    svg += '<g id="viewport" transform="scale(' + width/svgtw
	+ '),translate(' + svgl + ',' + svgt + ')">\n';
    
    // cursor
    svg += '<g id="cursor"></g>';

    // background grid
    var grd = '<g id="grid">\n';
    grd += '<circle cx="-' + svgf + '" cy="' + svgh
	+ '" r="' + svgc +'" stroke="rgb(200,100,100)"'
        + ' stroke-width="4" fill="red" fill-opacity="' + g_visible + '"/>';
    if (g_visible == 0) {
	grd += '<title>(click to show grid)</title></g>';
    }
    else {
	grd += '<title>(click to hide grid)</title></g>'
	    + '<path stroke="rgb(200,100,100)" fill="red" stroke-width="4"'
	    + ' d="M0,0 ';
	var uparrow = ' l-' + adx1 + ',' + ady1 + 'l' + adx2 + ',0 l-' + adx1
	    + ',-' + ady1 +  'm200,-';
	for (var x = 0; x <= svgw; x += 200) {
	    if (x%1000 == 0)
		grd += 'l0,' + svgh + uparrow + svgh;
	    else
		grd += 'l0,' + svgh + ' m200,-' + svgh;
	}
	grd += 'M0,0 '
	for (var y = 0; y <= svgh; y += 200)
	    grd += 'l' + svgw + ',0 m-' + svgw +',200 ';
	grd += '" />\n';
    }

    // timestamps
    var svgts = svgh + 20*dt_sec;
    var tsm = (t0_ticks + +tf_ticks)/2;

    tst = '<g id="times">\n<text x="0" y="' + svgts + '" font-size="' + svgtf
	+ '" fill="red" style="text-anchor: start;">' + timstr(t0_ticks) + '</text>'
	+ '\n';

    if (dt_sec%2 == 0) {
	tst += 	'\n<text x="' + svgw/2 + '" y="' + svgts + '" font-size="'
	    + svgtf + '" fill="red" style="text-anchor: middle;">'
	    + timstr(tsm) + '</text>\n';
    }

    tst += '<text x="' + svgw + '" y="' + svgts + '" font-size="' + svgtf
	+ '" fill="red" style="text-anchor: end;">' + timstr(tf_ticks) + '</text>'
	+ '</g>\n';
    
    // annotator names and annotations
    sva = '<g id="mrkr">\n';
    sva += '<circle cx="-' + svgf + '" cy="0" r="' + svgc
	+ '" stroke="rgb(0,0,200)"'
        + ' stroke-width="4" fill="blue" fill-opacity="' + m_visible + '"/>';
    if (m_visible == 0)
	sva += '<title>(click to show marker bars)</title></g>';
    else
	sva += '<title>(click to hide marker bars)</title></g>';
    var downarrow = ',0 l-' + adx1 + ',-' + ady1 + ' l' + adx2 + ',0 l-' + adx1
	+ ',' + ady1 + ' V';
    for (ia = 0; ia < nann; ia++) {
	var y0 = y0a[ia];
	var aname = ann[ia].name;
	sva += '<g id="ann;;' + aname + '">\n';
	if (a_visible[aname] == 1) {
	    sva += '<title>' + ann[ia].desc;
	    if (aname == annselected) {
		sva += ' (click for normal view)</title>'
		    + '<text font-weight="bold"';
	    }
	    else {
		sva += ' (click to hide)</title><text'
	    }
	    sva += ' x="-50" y="' + y0
		+ '" font-size="' + svgf + '" fill="blue" font-style="italic"'
		+ ' style="text-anchor: end; dominant-baseline: middle"';
	    if (aname == annselected)
		sva += ' font-weight="bold"';
	    sva += '>' + aname + '</text></g>\n';
	    var a = ann[ia].annotation;
	    for (var i = 0; i < a.length; i++) {
		if (a[i].t < t0_ticks) continue;
		else if (a[i].t > tf_ticks) break;
		var x, y, y1, txt;
		x = Math.round((a[i].t - t0_ticks)*1000/tickfreq);
		if (a[i].x && (a[i].a == '+' || a[i].a == '"')) {
		    if (a[i].a == '+') y = y0+svgf;
		    else y = y0-svgf;
		    txt = '' + a[i].x;
		}
		else {
		    y = y0;
		    // display N annotations as bullets
		    if (a[i].a == 'N') txt = '&bull;'
		    else txt = a[i].a;
		}
		if (m_visible) {
		    y1 = y - 150;
		    sva += '<path stroke="rgb(0,0,200)" stroke-width="6"'
			+ ' fill="blue" + opacity="' + m_visible
			+ '" d="M' + x + downarrow + y1
			+ ' m0,210 V' + svgh + '" />\n';
		}
		sva += '<text x="' + x + '" y="' + y
		    + '" style="text-anchor: middle;"';
		if (aname == annselected)
		    sva += ' font-weight="bold"';
		sva += ' font-size="' + svgf + '" fill="rgb(0,0,200)">'
		    + txt + '</text>\n'; 
	    }
	}
	else {
	    sva += '<title>' + ann[ia].desc
	    	+ ' (click for highlighted view)</title>'
		+ '<text x="-50" y="' + y0 + '"'
		+ ' font-size="120" fill="rgb(150,150,200)" font-style="italic"'
		+ ' style="text-anchor: end; dominant-baseline: middle">'
		+ aname + '</text></g>\n';
	}
    }

    // signal names and traces
    svs = '';
    for (is = 0; is < nsig; is++) {
	var y0 = y0s[is];
	var sname = signals[is].name;
	var trace = find_trace(db, record, sname, t0_ticks);
	
	svs += '<g id="sig;;' + sname + '">\n';
	if (trace && s_visible[sname] == 1) {
	    svs += '<title>' + sname;
	    if (sname == sigselected) {
		svs += ' (click for normal view)</title>'
		    + '<text font-weight="bold"';
	    }
	    else {
		svs += ' (click to hide)</title><text'
	    }
	    svs += ' x="-50" y="' + y0
		+ '" font-size="' + svgf + '" fill="black" font-style="italic"'
		+ ' style="text-anchor: end; dominant-baseline: middle">'
		+ sname + '</text></g>\n';
	    var s = trace.samp;
	    var g = (-400*mag[sname]/(trace.scale*trace.gain));
	    var z = trace.zbase*g - y0;
	    var v = Math.round(g*s[0] - z);
	    // move to start of trace
	    svs += '<path stroke="black" fill="none" stroke-width="';
	    if (sname == sigselected)
		svs += '10';
	    else
		svs += '6';
	    svs += '" d="';  // + 'M0,' + v + ' L';
	    var t = 0;
	    var tps = trace.tps;
	    var tmax = s.length * tps;
	    var ts = 1000/tickfreq;
	    var pv = false;
	    if (tmax > dt_ticks) tmax = dt_ticks;
	    // add remaining samples to the trace
	    for (var i = 0; t < tmax; i++, t += tps) {
		if (s[i] != -32768) {
		    v = Math.round(g*s[i] - z);
		    if (pv) svs += ' ' + t*ts + ',' + v;
		    else svs += ' M' + t*ts + ',' + v
			      + ' L' + t*ts + ',' + v;
		    pv = true;
		}
		else
		    pv = false;
	    }
	    svs += '" />\n';
	}
	else {	// signal is hidden, show label only
	    svs += '<title>' + sname + ' (click for highlighted view)</title>'
		+ '<text x="-50" y="' + y0 + '"'
		+ ' font-size="120" fill="rgb(128,128,128)" font-style="italic"'
		+ ' style="text-anchor: end; dominant-baseline: middle">'
		+ sname + '</text></g>\n';
	}
    }

    svg += grd + tst + sva + svs;
    $('#editdata').empty();
    $('#plotdata').html(svg + '</svg>\n');
    $('.pointer').html('&nbsp;');
    handle_svg_events();    // Handle user input in the signal window
}

function update_output() {
    if (current_tab == 'View/edit') show_plot();
    else if (current_tab == 'Tables') show_tables();
}

// Retrieve one or more complete annotation files for the selected record.
function read_annotations(t0_string) {
    nann = 0;	// new record -- (re)fill the cache
    if (ann_set.length) {
	var annreq = '', i;
	for (i = 0; i < ann_set.length; i++) {
	    var a = ann_set[i].name;
	    annreq += '&annotator=' + encodeURIComponent(a);
	}
	url = server + '?action=fetch&db=' + db + '&record=' + record + annreq
	    + '&dt=0&callback=?';
	$.getJSON(url, function(data) {
	    for (i = 0; i < data.fetch.annotator.length; i++, nann++) {
		ann[nann] = data.fetch.annotator[i];
		a_visible[ann[nann].name] = 1;
		ann[nann].opacity = 1;
		for (var j = 0; j < ann_set.length; j++)
		    if (ann[nann].name == ann_set[j].name)
			ann[nann].desc = ann_set[j].desc;
	    }
	    for (i = 0; i < ann.length; i++) {
		var len, t;
		adt_ticks = 0;
		len = ann[i].annotation.length;
		if (len > 0) var t = ann[i].annotation[len-1].t;
		if (t > adt_ticks) adt_ticks = t;
	    }
	    slist(t0_string);
	});
    }
    else {
	slist(t0_string);
    }
}

// Retrieve one or more signal segments starting at t for the selected record.
function read_signals(t, update) {
    var i, trace = '', sigreq = '';

    if (signals) {
	for (i = 0; i < signals.length; i++) {
	    if (s_visible[signals[i].name] == 1) {
		trace = find_trace(db, record, signals[i].name, t);
		if (trace) {
		    trace.id = tid++;	// found, mark as recently used
		}
		else {		
		    var s = signals[i].name;
		    sigreq += '&signal=' + encodeURIComponent(s);
		}
	    }
	}
    }
    if (sigreq) {
	url = server
	    + '?action=fetch'
	    + '&db=' + db
	    + '&record=' + record
	    + sigreq
	    + '&t0=' + t/tickfreq
	    + '&dt=' + dt_sec
	    + '&callback=?';
	$.getJSON(url, function(data) {
	    var fetch = data.fetch;
	    if (fetch && fetch.hasOwnProperty('signal')) {
		var s = data.fetch.signal;
		for (i = 0; i < s.length; i++)
		    set_trace(db, record, s[i]);
	    }
	    if (update) update_output();
	});
    }
    else if (update) update_output();
}

// Prefetch data for later use.
function prefetch(t_ticks) {
    if (t_ticks < 0) t_ticks = 0;
    if (t_ticks < rdt_ticks) read_signals(t_ticks, false);
}

// Button handlers
function go_here(t_ticks) {
    if (t_ticks >= rdt_ticks) {
	t_ticks = rdt_ticks;
	$('.fwd').attr('disabled', 'disabled');
	$('.eor').attr('disabled', 'disabled');
	$('.sfwd').attr('disabled', 'disabled');
    }
    else {
	$('.fwd').removeAttr('disabled');
	$('.eor').removeAttr('disabled');
	if (target) $('.sfwd').removeAttr('disabled');
    }
    if (t_ticks <= 0) {
	t_ticks = 0;
	$('.rev').attr('disabled', 'disabled');
	$('.sor').attr('disabled', 'disabled');
	$('.srev').attr('disabled', 'disabled');
    }
    else {
	$('.rev').removeAttr('disabled');
	$('.sor').removeAttr('disabled');
	if (target) $('.srev').removeAttr('disabled');
    }

    var title = 'LW: ' + db + '/' + record;
    document.title = title;
    var t0_string = timstr(t_ticks);
    $('.t0_str').val(t0_string);
    t0_ticks = t_ticks;
    tf_ticks = t_ticks + dt_ticks;
    read_signals(t0_ticks, true); // read signals not previously cached, if any

    if (tf_ticks >= rdt_ticks) {
	$('.fwd').attr('disabled', 'disabled');
	$('.eor').attr('disabled', 'disabled');
	$('.sfwd').attr('disabled', 'disabled');
    }
}

function gostart() {
    go_here(0);
}

function gorev() {
    var t0_string = $('.t0_str').val();
    var t_ticks = strtim(t0_string) - dt_ticks;
    go_here(t_ticks);
    prefetch(t_ticks - dt_ticks);
}
	 
function go_to() {
    var t0_string;
    if (current_tab == 'View/edit') t0_string = $('#view .t0_str').val();
    else if (current_tab == 'Tables') t0_string = $('#tables .t0_str').val();
    $('.t0_str').val(t0_string);
    var t_ticks = strtim(t0_string);
    go_here(t_ticks);
}

function gofwd() {
    var t0_string = $('.t0_str').val();
    var t_ticks = strtim(t0_string) + dt_ticks;
    go_here(t_ticks);
    prefetch(t_ticks + +dt_ticks);
}

function goend() {
    var t = Math.floor((rdt_ticks-1)/(dt_ticks));
    go_here(t*dt_ticks);
}

function srev() {
    var na = 0, sa = '', i, t;

    // find the annotation set
    for (i = 0; i < nann; i++) {
	if (ann[i].name == atarget) {
	    sa = ann[i].annotation;
	    na = sa.length;
	    break;
	}
    }
    if (i >= nann) return;  // annotation set not found

    // find the last annotation in the set before the signal window
    for (i = na - 1; i >= 0 && sa[i].t > t0_ticks; i--)
	;

    // find the previous annotation matching the target
    for ( ; i >= 0 && sa[i].a != target && sa[i].x != target; i--)
	;

    // if a match was found ...
    if (i >= 0) {
	t = sa[i].t - (sa[i].t % dt_ticks);
	go_here(t);	// show it

	// find the last annotation in the set before the new signal window
	for ( ; i >= 0 && sa[i].t > t; i--)
	    ;

	// find and cache the previous match, if any
	for ( ; i >= 0 && sa[i].a != target && sa[i].x != target; i--)
	    ;
	// if another match was found ...
	if (i >= 0) {
	    t = sa[i].t - (sa[i].t % dt_ticks);
	    prefetch(t);  // cache it
	    return;
	}
	else {
	    // otherwise, disable further reverse searches
	    $('.srev').attr('disabled', 'disabled');
	    return;
	}
    }
    else {  // no match found, disable further reverse searches
	$('.srev').attr('disabled', 'disabled');
	alert(target + ' not found in ' + atarget
	      + ' before ' + timstr(t0_ticks));
    }
}

function sfwd() {
    var na = 0, sa = '', i, t;

    // find the annotation set
    for (i = 0; i < nann; i++) {
	if (ann[i].name == atarget) {
	    sa = ann[i].annotation;
	    na = sa.length;
	    break;
	}
    }
    if (i >= nann) return;  // annotation set not found

    // find the first annotation in the set after the signal window
    for (i = 0; i < na && sa[i].t < tf_ticks; i++)
	;

    // find the next annotation matching the target
    for ( ; i < na && sa[i].a != target && sa[i].x != target; i++)
	;

    // if a match was found ...
    if (i < na) {
	t = sa[i].t - (sa[i].t % dt_ticks);
	go_here(t);	// show it

	// find the first annotation in the set after the new signal window
	t += +dt_ticks;
	for ( ; i < na && sa[i].t < t; i++)
	    ;
	// find and cache the next match, if any
	for ( ; i < na && sa[i].a != target && sa[i].x != target; i++)
	    ;
	// if another match was found ...
	if (i < na) {
	    t = sa[i].t - (sa[i].t % dt_ticks);
	    prefetch(t);  // cache it
	    return;
	}
	else {
	    // otherwise, disable further forward searches
	    $('.sfwd').attr('disabled', 'disabled');
	    return;
	}
    }
    else {  // no match found, disable further forward searches
	$('.sfwd').attr('disabled', 'disabled');
	alert(target + ' not found in ' + atarget
	      + ' after ' + timstr(tf_ticks));
    }
}

// Set target for searches.
function find() {
    if (nann < 1) {
	alert('No annotations to search!');
	return;
    }

    var content = '<p>Search for: <input type="text"'
	+ ' name="target" id="target" value="' + target + '"'
	+ ' title="Enter an annotation mnemonic (N, V, S, ...)" size="4"></p>';
    if (nann > 1) {
	content += '<br>In annotator: <select name=\"atarget\">\n';
	if (atarget === '') {
	    content += 	'<option value=\"\" selected>--Choose one--</option>\n';
	}
	for (var i = 0; i < ann_set.length; i++) {
	    content += '<option value=\"' + ann_set[i].name + '\"';
	    if (atarget === ann_set[i].name) {
		content += ' selected';
	    }
	    content += '>' + ann_set[i].name + '</option>\n';
	}
	content += '</select></td>\n';
    }
    $('#findbox').dialog("open").html(content);
    $('#findbox').dialog({
	open: function(event, ui){
	    $('.srev').attr('disabled', 'disabled');
	    $('.sfwd').attr('disabled', 'disabled');
	}
    });
    $('#findbox').dialog({
	beforeClose: function(event, ui){
	    target = $('#target').val();
	    if (nann > 1) {
		atarget = $('[name=atarget]').val();
	    }
	    else atarget = ann_set[0].name;
	}
    });
    $('#findbox').dialog({
	close: function(event, ui){
	    if (t0_ticks > 0)
		$('.srev').removeAttr('disabled');
	    if (tf_ticks <= rdt_ticks)
		$('.sfwd').removeAttr('disabled');
	}
    });
}

function stretch_signal() {
    if (sigselected != '' && mag[sigselected] < 1000) {
	mag[sigselected] *= 1.1;
	show_plot();
    }
}

function shrink_signal() {
    if (sigselected != '' && mag[sigselected] > 0.001) {
	mag[sigselected] /= 1.1;
	show_plot();
    }
}

function reset_signal() {
    if (sigselected != '' && mag[sigselected] != 1) {
	mag[sigselected] = 1.1;
	show_plot();
    }
}

function set_server() {
    server = $('[name=server]').val();
    dblist();
}

function help() {
    $('#helpframe').attr('src', 'doc/' + help_main);
}

function help_topics() {
    $('#helpframe').attr('src', 'doc/topics.html');
}

function help_contacts() {
    $('#helpframe').attr('src', 'doc/contacts.html');
}

function show_time(x) {
    var m = viewport.getScreenCTM();
    x_cursor = (x - m.e)/m.a;
    if (x_cursor < 0) x_cursor = 0;
    else if (x_cursor > svgw) x_cursor = svgw;
    var t = t0_ticks + x_cursor*tickfreq/1000;
    var ts = mstimstr(t);
    $('.pointer').html(ts);

    svc = null;
    svc = '<div style="width: ' + sww + 'px; height: ' + height
	+ 'px; margin-left: ' + swl + 'px;">'
	+ '<svg width="' + sww + '" height="' + height
	+ '" preserveAspectRatio="xMidYMid meet">\n'
	+ '<g transform="scale(' + sww/svgw + '),translate(0,' + svgt
	+ ')" id="crs">'
	+ '<path stroke="rgb(0,100,200)" stroke-width="4" fill="blue" d="M'
	+ x_cursor + ',0 l-' + adx2 + ',-' + ady1 + ' l' + adx4 + ',0 l-' + adx2
	+ ',' + ady1 + ' V' + svgh
	+ ' l-' + adx2 + ',' + ady1 + ' l' + adx4 + ',0 l-' + adx2
	+ ',-' + ady1 + '" />';
	+ '</g></svg></div>';
    $('#editdata').html(svc);
    handle_svg_events();
}

// Load the list of signals for the selected record.
function slist(t0_string) {
    var title = 'LW: ' + db + '/' + record, t = 0;
    $('.recann').html(db + '/' + record);
    document.title = title;
    $('#info').empty();
    $('#anndata').empty();
    $('#sigdata').empty();
    $('#plotdata').empty();
    var url = server + '?action=info&db=' + db + '&record=' + record
	+ '&callback=?';
    nsig = 0;
    $.getJSON(url, function(data) {
	if (data) {
	    recinfo = data.info;
	    tickfreq = recinfo.tfreq;
	    dt_ticks = dt_sec * tickfreq;
	    if (recinfo.signal) {
		signals = recinfo.signal;
		nsig = signals.length;
		for (var i = 0; i < nsig; i++)
		    s_visible[signals[i].name] = mag[signals[i].name] = 1;
		init_tpool(nsig * 4);
	    }
	    else {
		signals = null;
		nsig = 0;
	    }
	}
	$('#tabs').tabs("enable");
	show_summary();
	$('#tabs').tabs("select", "#view");
	if (t0_string != '') t = strtim(t0_string);
	t0_string = timstr(t);
	$('.t0_str').val(t0_string);
	go_here(t);
	$('#top').show();
    });
};

// When a new record is selected, reload data and show the first 10 seconds.
function newrec() {
    record = $('[name=record]').val();
    var prompt = 'Reading annotations for ' + db + '/' + record;
    $('#prompt').html(prompt);
    read_annotations("0");
    prompt = 'Click on the <b>View/edit</b> tab to view ' + db + '/' + record;
    $('#prompt').html(prompt);
}

// Load the list of annotators in the selected database.
function alist() {
    url = server + '?action=alist&callback=?&db=' + db;
    $.getJSON(url, function(data) {
	if (data.success) ann_set = data.annotator;
	else ann_set = '';
    });
};

// Load the list of records in the selected database, and set up an event
// handler for record selection.
function rlist() {
    var rlist = '';
    url = server + '?action=rlist&callback=?&db=' + db;
    $('#rlist').html('<td colspan=2>Reading list of records in ' + db + '</td>');
    $.getJSON(url, function(data) {
	if (data) {
	    rlist += '<td align=right>Record:</td>' + 
		'<td><select name=\"record\">\n' +
		'<option value=\"\" selected>--Choose one--</option>\n';
	    for (i = 0; i < data.record.length; i++)
	        rlist += '<option value=\"' + data.record[i] +
		    '\">' + data.record[i] + '</option>\n';
	    rlist += '</select></td>\n';
	}
	$('#rlist').html(rlist);
	// fetch the list of signals when the user selects a record
	$('[name=record]').on("change", newrec);
    });
};

// When a new database is selected, reload the annotation and record lists.
function newdb() {
    db = $('#db').val();
    record = '';
    var title = 'LightWAVE: ' + db;
    document.title = title;
    $('#tabs').tabs({disabled:[1,2]});
    $('#rlist').empty();
    $('#info').empty();
    $('#anndata').empty();
    $('#sigdata').empty();
    $('#plotdata').empty();
    alist();
    rlist();
}

function alert_server_error() {
    alert('The LightWAVE server at\n' + server
	  + '\nis not responding properly.  Please check\n'
	  + 'the network connection.  Select another server\n'
	  + 'on the Settings tab if necessary.');
}

// Load the list of databases and set up an event handler for db selection.
function dblist() {
    var dblist = '';

    $('#dblist').html('<td colspan=2>Loading list of databases ...</td>')
    url = server + '?action=dblist&callback=?';
    var timer = setTimeout(alert_server_error, 10000);
    $.getJSON(url, function(data) {
	clearTimeout(timer);
	if (data && data.database && data.database.length > 0) {
	    dblist = '<td align=right>Database:</td>' + 
		'<td><select name=\"db\" id=\"db\">\n' +
		'<option value=\"\" selected>--Choose one--</option>\n';
	    for (i = 0; i < data.database.length; i++)
	        dblist += '<option value=\"' + data.database[i].name +
		'\">' + data.database[i].desc + ' (' +
		data.database[i].name + ')</option>\n';
	    dblist += '</select></td>\n';
	    $('#dblist').html(dblist)
	    $('#sversion').html("&nbsp;version " + data.version);
	    $('#db').on("change", newdb); // invoke newdb when db changes
	}
	else
	    alert_server_error();
    });
}

// Set up user interface event handlers.
function set_handlers() {
    $('#lwform').on("submit", false);      // disable form submission
    $(window).resize(show_plot);           // redraw signal window if resized
    // Allow the browser to redraw content from its cache when switching tabs
    // (using jQuery UI 1.9 interface; use 'cache: true' with older jQuery UI)
    $('#tabs').tabs({
	beforeLoad: function(event, ui) {
	    if (ui.tab.data("loaded")) { event.preventDefault(); return; }
	    ui.jqXHR.success(function() { ui.tab.data("loaded", true); });
	},
	select: function(event, ui) {
	    current_tab = $(ui.tab).text();
	}
    });
    // Button handlers
    //  on View/edit and Tables tabs:
    $('.go_to').on("click", go_to);      // go to selected location
    $('.t0_str').on("blur", go_to);       // go to selected location
//    $('[name=t0]').on("blur", go_to);    // go to selected location
    $('.fwd').on("click", gofwd);	 // advance by dt_sec and plot or print
    $('.rev').on("click", gorev);	 // go back by dt_sec and plot or print
    $('.sor').on("click", gostart);	 // go to start of record
    $('.eor').on("click", goend);	 // go to end of record
    $('.srev').on("click", srev);	 // search for previous 'Find' target
    $('.sfwd').on("click", sfwd);	 // search for next 'Find' target
    $('.find').on("click", find);	 // open 'Find' dialog
    $('.stretch').on("click", stretch_signal);
    $('.reset').on("click", reset_signal);
    $('.shrink').on("click", shrink_signal);
    $('#findbox').dialog({autoOpen: false});
    // disable search buttons until a target has been defined
    $('.sfwd').attr('disabled', 'disabled');
    $('.srev').attr('disabled', 'disabled');
    // disable signal resize buttons until a signal has been selected
    $('.stretch').attr('disabled', 'disabled');
    $('.reset').attr('disabled', 'disabled');
    $('.shrink').attr('disabled', 'disabled');

    $(function() {
	$('#dtslider').slider({
	    value: dt_sec,
	    min: 5,
	    max: 60,
	    step: 5,
	    slide: function(event, ui) {
		$('#swidth').val(ui.value);
		dt_sec = ui.value;
		dt_ticks = dt_sec * tickfreq;
		set_sw_width(dt_sec);
		go_here(t0_ticks);
	    }
	});
	$('#swidth').val(dt_sec);
    });
     
    // on Settings tab:
    $('[name=server]').on("change", set_server);      // go to selected location
    $('#allow_edit').on("change", toggle_edit);

    // on Help tab:
    $('#help_about').on("click", help);    // return to 'about' (main help doc)
    $('#help_topics').on("click", help_topics);  // show help topics
    $('#help_contacts').on("click", help_contacts); // show contacts
}

// Check for query string in URL, decode and run query or queries if present
function parse_url() {
    var s = window.location.href.split("?");
    var n = s.length, t = 0;
    
    t0_string = '0';
    if (n != 2) {
	$('#tabs').tabs({disabled:[1,2]});  // disable the View and Tables tabs
	$('#top').show();
	$('[name=server]').val(server);     // set default server URL
	dblist();	// no query, get the list of databases
	return;
    }
    var q = s[1].split("&");
    for (n = 0; n < q.length; n++) {
	var v = q[n].split("=");
	if (v[0] == 'db') db = v[1];
	else if (v[0] == 'record') record = v[1];
	else if (v[0] == 't0') {
	    t0_string = v[1];
	}
    }
    if (db !== '') {
	if (record === '') {
	    var title = 'LightWAVE: ' + db;
	    document.title = title;
	    $('#tabs').tabs({disabled:[1,2]});  // disable View and Tables tabs
	    $('#top').show();
	    $('[name=server]').val(server);     // set default server URL
	    dblist =  '<td align=right>Database:</td><td>' + db + '</td>';
	    $('#dblist').html(dblist);
	    alist();
	    rlist();
	}
	else {
	    $('#tabs').tabs();
	    $('#tabs').tabs("remove",0);
	    var title = 'LW: ' + db + '/' + record;
	    document.title = title;
	    $('.t0_str').val(t0_string);
	    current_tab = 'View/edit';
	    help_main = 'followed-link.html';
	    $('.recann').html(db + '/' + record);
	    dblist =  '<td align=right>Database:</td><td>' + db + '</td>';
	    $('#server').html(server);
	    $('#dblist').html(dblist);
	    rlist =  '<td align=right>Record:</td><td>' + record + '</td>';
	    $('#rlist').html(rlist);
	    url = server + '?action=alist&callback=?&db=' + db;
	    $.getJSON(url, function(data) {
		if (data.success) ann_set = data.annotator;
		else ann_set = '';
		read_annotations(t0_string);
	    });
	}
    }
}

// When the page is ready, load the list of databases and set up event handlers.
$(document).ready(function(){
    parse_url();			// handle query string if present
    help();				// load help into the help tab
    set_handlers();			// set UI event handlers
});
