// file: lightwave.js	G. Moody	18 November 2012
//			Last revised:	  12 March 2013   version 0.48
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

// 'server' is the first part of every AJAX request.  Change it if you are
// not using the public LightWAVE server.
var server = 'http://physionet.org/cgi-bin/lightwave';

var url;	// request sent to server (server + request-specific string)
var db = '';	// name of the selected database
var sdb = '';	// shortened name of the selected database
var record = '';// name of the selected record
var recinfo;    // metadata for the selected record, initialized by slist()
var tickfreq;   // ticks per second (LCM of sampling frequencies of signals)
var adt_ticks;  // length of longest annotation set, in ticks
var sdt_ticks;  // length of signals, in ticks
var rdt_ticks;	// record length, in ticks (max of adt_ticks and sdt_ticks)
var ann_set = ''; // annotators for the selected database, from alist()
var ann = [];   // annotations read and cached by read_annotations()
var nann = 0;	// number of annotators, set by read_annotations()
var annselected = '';// name of annotator to be highlighted/searched/edited
var selarr = null; // array of annselected annotations
var selann = -1;// index of selected annotation in selarr, if any
var asy0;	// baseline y for display of labels in selected annotation set
var signals;    // signals for the selected record, from slist()
var nsig = 0;	// number of signals, set by read_signals()
var sigselected = '';// name of signal to be highlighted, if any
var current_tab;// name of the currently selected tab
var dt_sec = 10;// window width in seconds
var dt_ticks;   // window width in ticks
var t0_ticks = -1; // time of the first sample in the signal window, in ticks
var tf_ticks;	// time of the first sample after the signal window, in ticks
var tickint;    // interval between timestamps on plot
var tpool = []; // cache of 'trace' objects (10-second signal segments)
var tid = 0;	// next trace id (all traces have id < tid)
var target = '*';// search target, set in Find... dialog
var atarget = '';// annotator to be searched, set in Find... dialog
var g_visible = 1; // visibility flag for grid (1: on, 0: off)
var m_visible = 1; // visibility flag for annotation marker bars (1: on, 0: off)
var a_visible = []; // visibility flags for annotators
var s_visible = []; // visibility flags for signals
var x_cursor = -1; // signal window cursor x-coordinate (see svgxyt())
var xx_cursor = -1;// raw cursor x-coordinate (= x_cursor if in signal window)
var y_cursor;	// unconstrained cursor y-coordinate (see svgxyt())
var t_cursor;	// time in ticks corresponding to x_cursor (see svgxyt())
var c_velocity = 10; // SVG cursor velocity (see nudge_left() and nudge_right())
var mag = [];   // magnification of signals in plots
var help_main = 'about.html'; // initial and main help topic
var svc = '';   // SVG code to draw the cursor (see show_time())
var svg = '';   // SVG code to draw the signal window (see show_plot())
var svsa = '';   // SVG code to highlight the selected annotation (see jump_*)
var m = null;  // current transformation matrix for signal window
var requests = 0; // count of AJAX requests since last page load
var pending = 0;  // count of pending AJAX requests
var rqlog = '';	// AJAX request log (hidden by default)
var autoscroll = null; // autoplay_fwd/rev timer
var editing = false;   // editing controls hidden if false
var shortcuts = false; // editing mode (true: use shortcuts, false: don't)

var width;	// width of View/edit panel, in pixels
var height;	// height of View/edit panel, in pixels
var swl;        // width of left column, in pixels
var sww;	// signal window width, in pixels
var swr;	// width of right column, in pixels
var svgw;	// grid width, in SVG coords
var svgh;	// grid height, in SVG coords
var svgl;	// left column width, in SVG coords
var svgr;       // right column width, in SVG coords
var svgtw;	// total available width in SVG coords
var svgf;	// font-size for signal/annotation labels
var svgtf;	// small font-size for timestamps
var svgc;	// size for small elements (circles, etc.)
var adx1;	// arrow half-width
var adx2;	// arrow width / edit marker half-width
var adx4;	// edit marker width
var ady1;	// arrow height

// Initialize or expand tpool
function init_tpool(ntrace) {
    for (var i = tpool.length; i < ntrace; i++) {
	tpool[i] = {};
	tpool[i].id = tid++;
    }
}

// Replace the least-recently-used trace with the contents of s
function set_trace(db, record, s) {
    var idmin = tid, imin, j, len, ni, p, trace, v, vmean, vmid, vmax, vmin, w;

    len = s.samp.length;

    // do nothing if the trace is already in the pool
    if ((trace = find_trace(db, record, s.name, s.t0)) &&
	 trace.tf >= s.t0 + len*s.tps)
	return;

    // set additional properties of s that were not supplied by the server
    s.id = tid++;
    s.db = db;
    s.record = record;
    s.tf = s.t0 + len*s.tps;

    // restore amplitudes from first differences sent by server
    v = s.samp;
    vmean = vmax = vmin = v[0];
    for (j = ni = p = 0; j < len; j++) {
	p = v[j] += p;
	if (p == -32768) ni++; // ignore invalid samples in baseline calculation
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
	    tpool[i].t0 <= t && t < tpool[i].tf &&
	    tpool[i].record == record && tpool[i].db == db) {
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
    return Math.round(t*tickfreq);
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
    if (recinfo.start)
	itext += ' <tr><td>Start</td><td>' + recinfo.start + '</td></tr>\n';
    itext += ' <tr><td>Clock frequency&nbsp;</td><td>' + tickfreq
	+ ' ticks per second</td></tr>\n';

    if (nann > 0) {
	for (ia = 0; ia < nann; ia++) {
	    itext += '<tr><td style="vertical-align: top">Annotator: '
		+ ann[ia].name + '</td><td>' + '(' + ann[ia].annotation.length
		+ ' annotations)<br>\n<table style="padding: 0 0 1em 3em">';
	    var i, s = ann[ia].summary;
	    for (i = 0; i < s.length; i++) {
		    itext += '<tr><td>' + s[i][0] + '</td><td align=right>' + s[i][1] + '</td</tr>\n';
	    }
	    itext += '</table>\n</td></tr>\n';
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
		    + '\n<p><table class="dtable">\n<tr>'
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

	    for (var t = t0_ticks; t < tf_ticks; t++) {
		stext += '</tr>\n<tr><td>' + mstimstr(t);
		for (var j = 0; j < is; j++) {
		    stext += '</td><td>';
		    if (t%sig[j].tps == 0) {
			if (t >= sig[j].tf) {
			    sig[j] = find_trace(db, record, sig[j].name,
						sig[j].tf);
			}
			var vi = sig[j].samp[(t - sig[j].t0)/sig[j].tps];
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

function do_edit(e) {
    var x = e.pageX;
    var y = e.pageY;
    c_velocity = 10;
    show_time(x, y);
}

function handle_edit() {
    if (editing) {
	$('.editgroup').show();
	if (shortcuts) {
	    $('svg').on('mousedown', select_ann)
		.on('mouseup', move_selection)
		.on('mousemove', do_edit)
	        .off('touchstart touchend');
	}
	else {
	    $('svg').on("touchstart", function(e) { select_ann(e);})
		.on("touchend", function(e) { move_selection(e);})
		.off('mousemove', do_edit)
	        .off('mouseup', move_selection)
	        .off('mousedown', select_ann);
	}
    }
    else {
	$('svg').off('mousedown mouseup touchstart touchend');
	$('.editgroup').hide();
    }
}

var seltype;

function select_type(e) {
    var ann = { a : null, s: null, c: null, n: null, x: null };

    $(seltype).css("color", "blue").css("background-color", "white");
    seltype = e.target;
    $(seltype).css("color", "white").css("background-color", "blue");
    var s = $(seltype).text();
    var f = s.split(":");

    switch (f.length) {
    case 1:
	if (f[0][0] == '(' && f[0].length > 1) {
	    ann.a = '+';
	    ann.x = f[0];
	}
	else
	    ann.a = f[0];
	break;
    case 2:
	ann.a = f[0];
	ann.x = f[1];
	break;
    }
    copy_to_template(ann);
}

// initialize the palette with the most common annotation types in summary
function load_palette(summary) {
    var i, imax, ptext = '';

    imax = summary.length;
    if (imax > 20) imax = 20;
    for (i = 0; i < imax; i++) {
	ptext += '<button class="palette_ann"';
	if (i == 0) {
	    ptext += ' style="color: white; background-color: blue"';
	    seltype = '#palette_0';
	}
	else
	    ptext += ' style="color: blue; background-color: white"';
	ptext += ' id="palette_' + i + '">' + summary[i][0] + '</button>';
    }
    var f = summary[0][0].split(":");

    switch (f.length) {
    case 1:
	if (f[0][0] == '(' && f[0].length > 1) {
	    ann.a = '+';
	    ann.x = f[0];
	}
	else
	    ann.a = f[0];
	break;
    case 2:
	ann.a = f[0];
	ann.x = f[1];
	break;
    }
    copy_to_template(ann);
    $('#palette').html(ptext);
    $('.palette_ann').on('click', select_type);
}


function handle_svg_events() {
    $('svg').click(function(event){ mark(event); });
    $('#grid').click(function(event){ g_visible = 1 - g_visible; show_plot();});
    $('#mrkr').click(function(event){ m_visible = 1 - m_visible; show_plot();});

    $("[id^='ann;;']").click(function(event){
	var aname = $(this).attr('id').split(";")[2];
	if (a_visible[aname] == 0) {
	    a_visible[aname] = 1;
	    annselected = aname;
	    for (var i = 0; i < nann; i++) {
		if (ann[i].name == aname) {
		    selarr = ann[i].annotations;
		    load_palette(ann[i].summary);
		    break;
		}
	    }
	}
	else if (annselected == aname) {
	    annselected = '';
	    if (nann > 1) selarr = null;
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
    if (nann > 0) asy0 = y0a[0];

    svg = '<br><svg xmlns=\'http://www.w3.org/2000/svg\''
	+ ' xmlns:xlink=\'http:/www.w3.org/1999/xlink\' class="svgplot"'
	+ ' width="' + width + '" height="' + height
	+ '" preserveAspectRatio="xMidYMid meet">\n';
    svg += '<g id="viewport" transform="scale(' + width/svgtw
	+ '),translate(' + svgl + ',' + svgf + ')">\n';
    
    // background grid
    var grd = '<g id="grid">\n';
    grd += '<circle cx="-' + svgf + '" cy="' + svgh
	+ '" r="' + svgc +'" stroke="rgb(200,100,100)"'
        + ' stroke-width="4" fill="red" fill-opacity="' + g_visible + '"/>';
    if (g_visible == 0) {
	grd += '<title>(click to show grid)</title></g>';
    }
    else {
	var x0s = (1000-Math.floor((t0_ticks % tickfreq)*1000/tickfreq))%1000;
	var x0r = x0s%200;
	var x0q = Math.floor(x0s/200)*200;
	grd += '<title>(click to hide grid)</title></g>'
	    + '<path stroke="rgb(200,100,100)" fill="red" stroke-width="4"'
	    + ' d="M' + x0r + ',0 ';
	var uparrow = ' l-' + adx1 + ',' + ady1 + 'l' + adx2 + ',0 l-' + adx1
	    + ',-' + ady1 +  'm200,-';
	for (var x = 0; x + x0r <= svgw; x += 200) {
	    if (x%1000 == x0q)
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
    var ttick = Math.floor(t0_ticks/tickint) * tickint;
    if (ttick < t0_ticks) ttick += tickint;

    var tst = '<g id="times">\n';
    while (ttick <= tf_ticks) {
	var xtick = Math.round((ttick - t0_ticks)*1000/tickfreq);
	tst += '<text x="' + xtick + '" y="' + svgts + '" font-size="' + svgtf
	    + '" fill="red" style="text-anchor: middle;">'
	    + timstr(ttick) + '</text>\n';
	ttick += tickint;
    }
    tst += '</g>\n';


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
	var ytop = y0 - svgf;
	var aname = ann[ia].name;
	sva += '<g id="ann;;' + aname + '">\n';
	if (a_visible[aname] == 1) {
	    sva += '<title>' + ann[ia].desc;
	    if (aname == annselected) {
		asy0 = y0;
		sva += ' (click for normal view)</title>';
	    }
	    else {
		sva += ' (click to hide)</title>';
	    }
	    sva += '<rect x="-' + svgl + '" y="' + ytop
		+ '" width="' + svgl + '" height="' + 2*svgf
		+ '" fill="white" />'
		+ '<text x="-50" y="' + y0
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
		+ '<rect x="-' + svgl + '" y="' + ytop
		+ '" width="' + svgl + '" height="' + 2*svgf
		+ '" fill="white" />'
		+ '<text x="-50" y="' + y0 + '"' + ' font-size="' + svgf
		+ '" fill="rgb(150,150,200)" font-style="italic"'
		+ ' style="text-anchor: end; dominant-baseline: middle">'
		+ aname + '</text></g>\n';
	}
    }

    // signal names and traces
    var svs = '';
    for (is = 0; is < nsig; is++) {
	var y0 = y0s[is];
	var ytop = y0 - svgf;
	var sname = signals[is].name;
	var trace = find_trace(db, record, sname, t0_ticks);
	
	svs += '<g id="sig;;' + sname + '">\n';
	if (trace && s_visible[sname] == 1) {
	    svs += '<title>' + sname;
	    if (sname == sigselected)
		svs += ' (click for normal view)</title>';
	    else {
		svs += ' (click to hide)</title>'
	    }
	    svs += '<rect x="-' + svgl + '" y="' + ytop
		+ '" width="' + svgl + '" height="' + 2*svgf
		+ '" fill="white" />'
		+ '<text x="-50" y="' + y0
		+ '" font-size="' + svgf + '" fill="black" font-style="italic"'
		+ ' style="text-anchor: end; dominant-baseline: middle"';
	    if (sname == sigselected)
		svs += ' font-weight="bold"';
	    svs += '>' + sname + '</text></g>\n';

	    var s = trace.samp;
	    var tps = trace.tps;
	    var i;
	    var imin = (t0_ticks - trace.t0)/tps;
	    var imax = Math.min(s.length, dt_ticks/tps + imin);
	    var g = (-400*mag[sname]/(trace.scale*trace.gain));
	    var z = trace.zbase*g - y0;
	    var v = Math.round(g*s[imin] - z);
	    // move to start of trace
	    svs += '<path stroke="black" fill="none" stroke-width="';
	    if (sname == sigselected)
		svs += dt_sec;
	    else
		svs += dt_sec/2;
	    svs += '" d="';  // + 'M0,' + v + ' L';
	    var t = 0;
	    var tnext = t0_ticks;
	    var tf = Math.min(tf_ticks, rdt_ticks);
	    var x = 0;
	    var xstep = 1000/tickfreq;
	    var pv = false;
	    while (tnext < tf) {
		if (tnext > t0_ticks) {
		    trace = find_trace(db, record, sname, tnext);
		    if (trace == null) {
			if (pending < 1) {
			    read_signals(t0_ticks, true);
			    return;
			}
			else if (pending < 4) {
			    setTimeout(function() {
				trace = find_trace(db, record, sname, tnext);
			    },1000);  // try again after a second
			    return;
			}
			else {
			    autoplay_off();
			    alert_server_error();
			    return;
			}
		    }
		    s = trace.samp;
		    imin = (tnext - trace.t0)/tps;
		    imax = Math.min(s.length, (tf - tnext)/tps + imin);
		}
		for (i = imin; i < imax; i++) {
		    if (s[i] != -32768) {
			v = Math.round(g*s[i] - z);
			if (pv)
			    svs += ' '  + x + ',' + v;
			else
			    svs += ' M' + x + ',' + v
			    +  ' L' + x + ',' + v;
			pv = true;
		    }
		    else
			pv = false;
		    t += tps;
		    x = t*xstep;
		}
		tnext = trace.tf;
	    }
	    svs += '" />\n';
	}
	else {	// signal is hidden, show label only
	    svs += '<title>' + sname + ' (click for highlighted view)</title>'
		+ '<rect x="-' + svgl + '" y="' + ytop
		+ '" width="' + svgl + '" height="' + 2*svgf
		+ '" fill="white" />'
		+ '<text x="-50" y="' + y0 + '"' + ' font-size="' + svgf
		+ '" fill="rgb(128,128,128)" font-style="italic"'
		+ ' style="text-anchor: end; dominant-baseline: middle">'
		+ sname + '</text></g>\n';
	}
    }

    svg += grd + tst + sva + svs;
    $('#plotdata').html(svg + '</svg>\n');
    if (selann >= 0 &&
	t0_ticks <= selarr[selann].t && selarr[selann].t <= t0_ticks + dt_ticks)
	show_time(selarr[selann].t);
    handle_svg_events();    // Handle user input in the signal window
}

function update_output() {
    if (current_tab == 'View/edit') show_plot();
    else if (current_tab == 'Tables') show_tables();
}

function show_status(requestp) {
    var i, status;

    if (requestp) {
	requests++; pending++;
	if (requests > 10) {
	    for (i = rqlog.length - 5; i > 0 && rqlog[i] != '\n'; i--)
		;
	    rqlog = requests + ': ' + url + '<br>\n' + rqlog.substring(0, i);
	}
	else
	    rqlog = requests + ': ' + url + '<br>\n' + rqlog;
	$('#requests').html(rqlog);
    }
    else {
	pending--;
    }
    status = 'Requests: ' + requests + '&nbsp;&nbsp;Pending: ' + pending;
    $('#status').html(status);
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
	show_status(true);
	$.getJSON(url, function(data) {
	    slist(t0_string);
	    for (i = 0; i < data.fetch.annotator.length; i++, nann++) {
		ann[nann] = data.fetch.annotator[i];
		a_visible[ann[nann].name] = 1;
		for (var j = 0; j < ann_set.length; j++) {
		    if (ann[nann].name == ann_set[j].name)
			ann[nann].desc = ann_set[j].desc;
		}
	    }
	    for (i = 0; i < ann.length; i++) {
		var len, t;
		adt_ticks = 0;
		len = ann[i].annotation.length;
		if (len > 0) var t = ann[i].annotation[len-1].t;
		if (t > adt_ticks) adt_ticks = t;
	    }

	    // compile summaries of the annotation types in each set
	    for (i = 0; i < nann; i++) {
		var a = ann[i].annotation, j, key, s = {}, ss = [];

		for (j = 0; j < a.length; j++) {
		    if (a[j].x != null) {
			if (a[j].a == '+' && a[j].x[0] == '(') key = a[j].x;
			else key = a[j].a + ':' + a[j].x;
		    }
		    else
			key = a[j].a;
		    if (s.hasOwnProperty(key))
			s[key]++;
		    else
			s[key] = 1;
		}
		for (key in s)
		    ss.push([key, s[key]]);
		// sort the types by prevalence (most to least frequent)
		ann[i].summary = ss.sort(function(a, b) {return b[1] - a[1]});
	    }

	    if (annselected != '') {
		for (i = 0; i < nann; i++) {
		    if (annselected === ann[i].name) {
			selarr = ann[i].annotation;
			load_palette(ann[i].summary);
			break;
		    }
		}
		if (i >= nann)
		    annselected = '';
	    }
	    if (annselected == '') {
		annselected = ann[0].name;
		selarr = ann[0].annotation;
		load_palette(ann[0].summary);
	    }
	    show_status(false);
	});
    }
    else {
	annselected = '';
	selarr = null;
	slist(t0_string);
    }
}

// Retrieve one or more signal segments starting at t for the selected record.
function read_signals(t0, update) {
    var i, trace = '', sigreq = '', t, tf, tr = t0 + dt_ticks;

    if (signals) {
	for (i = 0; i < signals.length; i++) {
	    if (s_visible[signals[i].name] == 1) {
		t = t0;
		tf = t + dt_ticks;
		while (t < tf) {
		    trace = find_trace(db, record, signals[i].name, t);
		    if (trace) {
			trace.id = tid++;	// found, mark as recently used
			t = trace.tf;
		    }
		    else {		
			if (t < tr) tr = t; // must read samples from t to tf
			sigreq += '&signal='
			    + encodeURIComponent(signals[i].name);
			break;
		    }
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
	    + '&t0=' + tr/tickfreq
	    + '&dt=' + dt_sec
	    + '&callback=?';
	show_status(true);
	$.getJSON(url, function(data) {
	    var fetch = data.fetch;
	    if (fetch && fetch.hasOwnProperty('signal')) {
		var s = data.fetch.signal;
		for (i = 0; i < s.length; i++)
		    set_trace(db, record, s[i]);
	    }
	    if (update) update_output();
	    show_status(false);
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
	if (target && annselected) $('.sfwd').removeAttr('disabled');
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
	if (target && annselected) $('.srev').removeAttr('disabled');
    }

    var title = 'LW: ' + sdb + '/' + record;
    document.title = title;
    var t0_string = timstr(t_ticks);
    $('.t0_str').val(t0_string);
    t0_ticks = t_ticks;
    tf_ticks = t_ticks + dt_ticks;
    if (dt_sec < 10) tickint = tickfreq;
    else if (dt_sec < 35) tickint = 5 * tickfreq;
    else tickint = 10 * tickfreq;

    read_signals(t0_ticks, true); // read signals not previously cached, if any

    if (tf_ticks >= rdt_ticks) {
	$('.fwd').attr('disabled', 'disabled');
	$('.eor').attr('disabled', 'disabled');
	$('.sfwd').attr('disabled', 'disabled');
    }
    if (m) {
	var x = Math.round(x_cursor * m.a + m.e);
	var y = Math.round(asy0 * m.d + m.f);
	show_time(x, y);
    }
}

function scrollrev() {
    t0_ticks -= dt_sec;  // the increment was chosen to divide dt_ticks evenly
    if (t0_ticks <= 0) {
	t0_ticks = 0;
	autoplay_off();
    }
    go_here(t0_ticks);
    if (t0_ticks > 0)
	prefetch(Math.floor((t0_ticks - 1)/dt_ticks) * dt_ticks);
}

function scrollfwd() {
    t0_ticks += dt_sec;
    if (t0_ticks >= rdt_ticks - dt_ticks)
	autoplay_off();
    go_here(t0_ticks);
    if (t0_ticks < rdt_ticks - dt_ticks	&& (t0_ticks % dt_ticks == 0))
	prefetch(t0_ticks + 2*dt_ticks);
}

function resize_lightwave() {
    m = document.getElementById("viewport").getScreenCTM();
    set_sw_width(dt_sec);
    $('#helpframe').attr('height', $(window).height() - 180 + 'px');
    show_plot(); // redraw signal window if resized
}

function autoplay_off() {
    if (autoscroll) {
	clearInterval(autoscroll);
	autoscroll= null;
	$('.scrollfwd').html('&#9654;');
	$('.scrollrev').html('&#9664;');
    }
}

function autoplay_fwd() {
    if (autoscroll) autoplay_off();
    else {
	var dti = 50+dt_ticks*nsig/1000;
	autoscroll = setInterval(scrollfwd, dti);
	$('.scrollfwd').html('<div style="color: red">&#9632;</div>');
    }
}

function autoplay_rev() {
    if (autoscroll) autoplay_off();
    else {
	var dti = 50+dt_ticks*nsig/1000;
	autoscroll = setInterval(scrollrev, dti);
	$('.scrollrev').html('<div style="color: red">&#9632;</div>');
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

function match(sa, i) {
    var m = false;

    switch (target) {
    case '*':
	m = true;
	break;
    case '*v':
	switch (sa[i].a) {
	case 'V':
	case 'E':
	case 'r':
	    m = true;
	    break;
	}
	break;
    case '*s':
	switch (sa[i].a) {
	case 'S':
	case 'A':
	case 'a':
	case 'J':
	case 'e':
	case 'j':
	case 'n':
	    m = true;
	    break;
	}
	break;
    case '*n':
	switch (sa[i].a) {
	case 'N':
	case 'L':
	case 'R':
	case 'B':
	case 'F':
	case '/':
	case 'f':
	case 'Q':
	case '?':
	    m = true;
	    break;
	}
	break;
    default:
	if (sa[i].a == target || sa[i].x == target)
	    m = true;
    }
    return m;
}

function srev() {
    var na = 0, sa = '', i, t;

    // find the annotation set
    for (i = 0; i < nann; i++) {
	if (ann[i].name == annselected) {
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
    for ( ; i >= 0 && !match(sa, i); i--)
	;

    // if a match was found ...
    if (i >= 0) {
	var halfdt = Math.floor(dt_ticks/2);
	t = sa[i].t - halfdt;
	go_here(t);	// show it

	// find the last annotation in the set before the new signal window
	for ( ; i >= 0 && sa[i].t > t; i--)
	    ;

	// find and cache the previous match, if any
	for ( ; i >= 0 && !match(sa, i); i--)
	    ;
	// if another match was found ...
	if (i >= 0) {
	    t = sa[i].t - halfdt;
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
	alert(target + ' not found in ' + annselected
	      + ' before ' + timstr(t0_ticks));
    }
}

function sfwd() {
    var na = 0, sa = '', i, t;

    // find the annotation set
    for (i = 0; i < nann; i++) {
	if (ann[i].name == annselected) {
	    sa = ann[i].annotation;
	    na = sa.length;
	    break;
	}
    }
    if (i >= nann) return;  // annotation set not found

    // find the first annotation in the set after the signal window
//    i = ann_after(anns

    for (i = 0; i < na && sa[i].t < tf_ticks; i++)
	;

    // find the next annotation matching the target
    for ( ; i < na && !match(sa, i); i++)
	;

    // if a match was found ...
    if (i < na) {
	var halfdt = Math.floor(dt_ticks/2);
	t = sa[i].t - halfdt;
	go_here(t);	// show it

	// find the first annotation in the set after the new signal window
	t += +dt_ticks;
	for ( ; i < na && sa[i].t < t; i++)
	    ;
	// find and cache the next match, if any
	for ( ; i < na && !match(sa, i); i++)
	    ;
	// if another match was found ...
	if (i < na) {
	    t = sa[i].t - halfdt;
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
	alert(target + ' not found in ' + annselected
	      + ' after ' + timstr(tf_ticks));
    }
}

// Set target for searches.
function find() {
    var content = '', i;
    if (nann < 1) {
	alert('No annotations to search!');
	return;
    }
    else if ($('#findbox').dialog("isOpen")) {
	$('#findbox').dialog("close");
	return;
    }
    else if (nann == 1) {
	annselected = ann[0].name;
	content = '<div title= \"' + ann[0].desc + '">In: '
	    + ann[0].name + '</div>';
    }
    else {
	content = '<div title="Select a set of annotations to search">'
	    + 'In:&nbsp;<select name=\"annselected\" id=\"annselected\">\n';
	for (i = 0; i < nann; i++) {
	    if (annselected === ann[i].name) break;
	}
	if (i > nann) annselected = ann[0].name;
	for (i = 0; i < nann; i++) {
	    content += '<option value=\"' + ann[i].name + '\" title =\"'
		+ ann[i].desc + '\" ';
	    if (annselected === ann[i].name) {
		content += ' selected';
	    }
	    content += '>' + ann[i].name + '</option>\n';
	}
	content += '</select></div>\n';
    }
    $('#annsets').html(content);
    $('#target').val(target);
    $('#target, #annselected').on("change", function() {
	target = $('#target').val();
	if (nann > 1) {
	    annselected = $('#annselected').val();
	}
	else annselected = ann[0].name;
	if (target != '' && annselected != '') {
	    if (t0_ticks > 0)
		$('.srev').removeAttr('disabled');
	    if (tf_ticks <= rdt_ticks)
		$('.sfwd').removeAttr('disabled');
	}
    });
    
    $('#findbox').dialog("open");
    $('#findbox').dialog({
        height: 'auto',
	beforeClose: function(event, ui) {
	    target = $('#target').val();
	    if (nann > 1) annselected = $('#annselected').val();
	    else annselected = ann[0].name;
	},
	close: function(event, ui) {
	    if (target != '' && annselected != '') {
		if (t0_ticks > 0)
		    $('.srev').removeAttr('disabled');
		if (tf_ticks <= rdt_ticks)
		    $('.sfwd').removeAttr('disabled');
	    }
	}
    });
}

function stretch_signal() {
    if (sigselected != '' && mag[sigselected] < 1000) {
	mag[sigselected] *= 1.1;
	show_plot();
    }
}

function reset_signal() {
    if (sigselected != '' && mag[sigselected] != 1) {
	mag[sigselected] = 1.1;
	show_plot();
    }
}

function shrink_signal() {
    if (sigselected != '' && mag[sigselected] > 0.001) {
	mag[sigselected] /= 1.1;
	show_plot();
    }
}

// hide or show add type to palette dialog
function toggle_add_typebox() {
    if (!editing) {
	$('.editgroup').hide();
	return;
    }
    if (nann < 1) {
	alert('No annotations to edit!');
	return;
    }
    else if ($('#add_typebox').dialog("isOpen")) {
	$('#add_typebox').dialog("close");
	return;
    }
    else {
	$('#add_typebox').dialog("open");
	$('#add_typebox').dialog({
	    width: '500px',
	    height: 'auto'
	});
    }
}

function ann_after(a, t) {
    if (!a) return (-1);
    var i, imin = 0, imax = a.length - 1;

    while (imax - imin > 1) {
	i = Math.floor((imin + imax)/2);
	if (a[i].t <= t)
	    imin = i;
	else
	    imax = i;
    }
    return (imax);
}	    


function ann_before(a, t) {
    if (!a) return (-1);
    var i, imin = 0, imax = a.length - 1;

    while (imax - imin > 1) {
	i = Math.floor((imin + imax)/2);
	if (a[i].t > t)
	    imax = i;
	else
	    imin = i;
    }
    return (imin);
}	    

function highlight_selection() {
    var x0 = Math.floor((selarr[selann].t - t0_ticks)*1000/tickfreq) - svgf;
    var y0 = asy0 - 2*svgf;
    svsa = '<path stroke="rgb(0,0,0)" stroke-width="' + dt_sec
	+ '" fill="yellow" fill-opacity="0.2" d="M'
	+ x0 + ',' + y0 + ' l' + 2*svgf + ',0 l0,' + 3*svgf
	+ ' l-' + 2*svgf + ',0 l0,-' + 3*svgf + '" />';
}

function jump_left() {
    var i, x, y;
    var t = t0_ticks + x_cursor*tickfreq/1000;

    i = ann_before(selarr, t);
    t = selarr[i].t;

    if (t < t0_ticks) {
	do {
	    t0_ticks -= dt_ticks;
	} while (t < t0_ticks);
	go_here(t - dt_ticks/2);
    }
    if (selann == i) {
	selann = -1;
	svsa = '';
    }
    else {
	selann = i;
	highlight_selection();
    }
    x = Math.floor((t - t0_ticks)*1000/tickfreq * m.a + m.e);
    y = Math.round(asy0 * m.d + m.f);
    c_velocity = 10;
    show_time(x, y);
}

function nudge_left() {
    if (c_velocity > 0) c_velocity = -10;
    else if (c_velocity > -100) c_velocity *= 1.1;
    if (x_cursor > 0) x_cursor += c_velocity;
    var x = Math.round(x_cursor * m.a + m.e);
    var y = Math.round(asy0 * m.d + m.f);
    show_time(x, y);
}

function nudge_right() {
    if (c_velocity < 0) c_velocity = 10;
    else if (c_velocity < 100) c_velocity *= 1.1;
    if (x_cursor < svgw) x_cursor += c_velocity;
    var x = Math.round(x_cursor * m.a + m.e);
    var y = Math.round(asy0 * m.d + m.f);
    show_time(x, y);
}

function jump_right() {
    var i, x, y;
    var t = t0_ticks + x_cursor*tickfreq/1000;

    i = ann_after(selarr, t);
    t = selarr[i].t;

    if (t > t0_ticks + dt_ticks)
	go_here(t - dt_ticks/2);

    if (selann == i) {
	selann = -1;
	svsa = '';
    }
    else {
	selann = i;
	highlight_selection();
    }
    x = Math.ceil((t - t0_ticks)*1000/tickfreq * m.a + m.e);
    y = Math.round(asy0 * m.d + m.f);
    c_velocity = 10;
    show_time(x, y);
}

function undo() {
    ;
}

function select_ann(e) {
    svgxyt(e.pageX, e.pageY);
    if (asy0 - 2*svgf < y_cursor && y_cursor < asy0 + 3*svgf) {
	i = ann_before(selarr, t_cursor);
	if (i >= 0) {
	    dt = t_cursor - selarr[i].t;
	    if (dt < 150) {
		if (i+1 < selarr.length) {
		    if (dt > selarr[i+1].t - t_cursor)
			selann = i+1;
		    else
			selann = i;
		}
	    }
	    else if (i+1 < selarr.length) {
		if (selarr[i+1].t - t_cursor < 150)
		    selann = i+1;
	    }
	    else
		selann = -1;
	}
	if (selann >= 0) highlight_selection();
    }
}

function copy_from_template(ann)
{
    ann.a = $('#edita').val();
    ann.s = $('#edits').val();
    ann.c = $('#editc').val();
    ann.n = $('#editn').val();
    ann.x = $('#editx').val();
}

function copy_to_template(ann)
{
    $('#edita').val(ann.a);
    $('#edits').val(ann.s);
    $('#editc').val(ann.c);
    $('#editn').val(ann.n);
    $('#editx').val(ann.x);
}

function move_selection(e) {
    if (selann >= 0) {
	svgxyt(e.pageX, e.pageY);
	var sel = selarr[selann];
	// if the cursor is in the selection rectangle, apply the template
	if (anew.a && asy0 - 2*svgf < y_cursor && y_cursor < asy0 + svgf &&
	    sel.t - tickfreq/8 < t_cursor && t_cursor < sel.t + tickfreq/8) {
	    copy_from_template(sel);
	}
	// otherwise move the selected annotation without other modification
	else {
	    sel.t = t_cursor;
	    // if the order of annotations has changed, remove and reinsert sel
	    if ((selann > 0 && selarr[selann-1].t > sel.t) ||
		(selann < selarr.length && selarr[selann+1].t < sel.t)) {
 		selarr.splice(selann, 1);      // remove sel
		selann = ann_after(selarr, t); // find successor, update selann
		selarr.splice(i, 0, sel);      // reinsert sel before successor
	    }
	}
    }
}

function delete_ann() {
    selarr.splice(selann, 1);
}

var insert_mode = true;

function toggle_insert_mode() {
    if (insert_mode) {
	insert_mode = false;
	$('#insert_mode').css("color", "white").css("background-color", "red")
	    .attr("title", "click to return to insert mode");
    }
    else {
	insert_mode = true;
	$('#insert_mode').css("color", "red").css("background-color", "white")
	    .attr("title", "click to enter delete mode");
    }
}

function mark(event) {
    var a, anew, c, i;
    
    function anncomp(a, b) {
	if (a.t < b.t) return 1;
	else if (a.t > b.t) return -1;
	else if (a.c < b.c) return 1;
	else if (a.c > b.c) return -1;
	else if (a.n < b.n) return 1;
	else if (a.n > b.n) return -1;
	else return 0;
    }

    if (!editing
	|| (!annselected && nann != 1)
	|| x_cursor < 0
	|| x_cursor > svgw)
	return;

    if (nann != 1) {
	for (i = 0; i < nann; i++)
	    if (ann[i].name == annselected) break;
	if (i >= nann) return;
    }
    else
	i = 0;
    a = ann[i].annotation;

    anew = { t: null, a: null, s: null, c: null, n: null, x: null };

    anew.t = Math.round(t0_ticks + x_cursor*tickfreq/1000);
    anew.a = $('#edita').val();
    if (!anew.a) {
	alert('No edit performed!  Set the\n'
	    + 'Annotation type in the Insert...\n'
	    + 'box to enable editing.');
	if (!$('#editbox').dialog("isOpen"))
	    $('#editbox').dialog("open");
	return;
    }
    anew.s = $('#edits').val();
    anew.c = $('#editc').val();
    anew.n = $('#editn').val();
    anew.x = $('#editx').val();

    // commit the edit
    if (selann >= 0) {		// anew will replace selann
	a.splice(selann, 1);	// delete selann
    }

    // insert anew in time/chan/num order
    for (i = 0; i < a.length; i++) {
	c = anncomp(a[i], anew);
	if (c <= 0) break;
    }
    if (i >= a.length)
	a[i] = anew;	// add anew to the end of the annotation array
    else if (i == 0)
	a.unshift(anew);    // add anew at the beginning
    else
	a.splice(i, 0, anew); // insert anew between a[i-1] and a[i]
    update_output();
}

function redo() {
    ;
}

function set_server() {
    server = $('[name=server]').val();
    dblist();
}


function toggle_show_status() {
    $('#status').toggle();
    if ($('#status').is(":hidden")) {
	$('#show_status').html("Show status");
    }
    else {
	$('#show_status').html("Hide status");
    }
}

function toggle_show_requests() {
    $('#requests').toggle();
    if ($('#requests').is(":hidden")) {
	$('#show_requests').html("Show request log");
    }
    else {
	$('#show_requests').html("Hide request log");
    }
}

function clear_requests() {
    requests = 0; pending = 1;
    rqlog = '';
    show_status(false);
    $('#requests').empty();
}

function alert_editing() {
    alert("WARNING: Annotation editing is not yet implemented!\n\n"
	  + "Active editing controls affect the display only.\n"
	  + "Any edits you make will not be saved.\n\n"
	  + "See help topic 'Editing annotations with LightWAVE'\n"
	  + "for information about planned features, some of which\n"
	  + "have been implemented in this version.  More of these\n"
	  + "features will appear in the next few releases.");
}

function toggle_editing() {
    if (editing) {
	editing = false;
	$('#editing').html("Enable editing");
    }
    else {
	editing = true;
	$('#editing').html("Disable editing");
	alert_editing();
    }
    handle_edit();
}

function toggle_shortcuts() {
    if (shortcuts) {
	shortcuts = false;
	$('#shortcuts').html("Enable mouse shortcuts");
    }
    else {
	shortcuts = editing = true;
	$('#shortcuts').html("Disable mouse shortcuts");
	$('#editing').html("Disable editing");
	alert_editing();
    }
    handle_edit();
}

function new_annset() {
    alert("not yet implemented!");
}

function toggle_show_edits() {
    $('#edits').toggle();
    if ($('#edits').is(":hidden")) {
	$('#show_edits').html("Show edit log");
    }
    else {
	$('#show_edits').html("Hide edit log");
    }
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

// convert (x,y) in pixels to SVG coords and time in ticks
function svgxyt(x, y) {
	m = document.getElementById("viewport").getScreenCTM();
	x_cursor = xx_cursor = (x - m.e)/m.a;
	if (x_cursor < 0) x_cursor = 0;
	else if (x_cursor > svgw) x_cursor = svgw;
	y_cursor = (y - m.f)/m.d;
	t_cursor = t0_ticks + x_cursor*tickfreq/1000;
}

function show_time(x, y) {
    svgxyt(x, y);
    var ts = mstimstr(t_cursor);
    $('.pointer').html(ts);

    if (editing) {
	var xc = x_cursor - 2*adx4;
	svc = '<path stroke="rgb(0,150,0)" stroke-width="' + dt_sec
	    + '" fill="none" d="M' + x_cursor
	    + ',0 l-' + adx2 + ',-' + ady1 + ' l' + adx4 + ',0 l-' + adx2
	    + ',' + ady1 + ' V' + svgh
	    + ' l-' + adx2 + ',' + ady1 + ' l' + adx4 + ',0 l-' + adx2
	    + ',-' + ady1 + '" />';
	svc += '<path stroke="rgb(0,0,0)" stroke-width="' + dt_sec
	    + '" fill="none" d="M' + xc + ',' + y_cursor
	    + ' l' + 4*adx4 + ',0" />';
	$('#plotdata').html(svg + svc + svsa + '</svg>\n');
    }
    handle_svg_events();
}

// Load the list of signals for the selected record.
function slist(t0_string) {

    var title = 'LW: ' + sdb + '/' + record, t = 0;
    $('.recann').html(sdb + '/' + record);
    document.title = title;
    $('#info').empty();
    $('#anndata').empty();
    $('#sigdata').empty();
    $('#plotdata').empty();
    nsig = 0;
    url = server + '?action=info&db=' + db + '&record=' + record
	+ '&callback=?';
    show_status(true);
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
		init_tpool(nsig * 8);
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
	show_status(false);
    });
};

// When a new record is selected, reload data and show the first dt_sec seconds.
function newrec() {
    record = $('[name=record]').val();
    $('#findbox').dialog("close");
    $('#add_typebox').dialog("close");
    var prompt = 'Reading annotations for ' + sdb + '/' + record;
    $('#prompt').html(prompt);
    read_annotations("0");
    prompt = 'Click on the <b>View/edit</b> tab to view ' + sdb + '/' + record;
    $('#prompt').html(prompt);
    set_sw_width(dt_sec);    
}

// Load the list of annotators in the selected database.
function alist() {
    url = server + '?action=alist&callback=?&db=' + db;
    show_status(true);
    $.getJSON(url, function(data) {
	if (data.success) ann_set = data.annotator;
	else ann_set = '';
	show_status(false);
    });
};

// Load the list of records in the selected database, and set up an event
// handler for record selection.
function rlist() {
    var rlist = '';
    url = server + '?action=rlist&callback=?&db=' + db;
    $('#rlist').html('<td colspan=2>Reading list of records in ' + sdb
		     + '</td>');
    show_status(true);
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
	show_status(false);
    });
};

// When a new database is selected, reload the annotation and record lists.
function newdb() {
    db = $('#db').val();
    var dbparts = db.split('/');
    if (dbparts.length > 1) sdb = '.../' + dbparts.pop();
    else sdb = db;
    record = '';
    var title = 'LightWAVE: ' + sdb;
    document.title = title;
    $('#tabs').tabs({disabled:[1,2]});
    $('#rlist').empty();
    $('#annsets').empty();
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
    show_status(true);
    $.getJSON(url, function(data) {
	clearTimeout(timer);
	if (data && data.database && data.database.length > 0) {
	    dblist = '<td align=right>Database:</td>' + 
		'<td><select name=\"db\" id=\"db\">\n' +
		'<option value=\"\" selected>--Choose one--</option>\n';
	    for (i = 0; i < data.database.length; i++) {
		var dbi = data.database[i].name;
		var dbparts = dbi.split('/');
		var sdbi;
		if (dbparts.length > 1) sdbi = '.../' + dbparts.pop();
		else sdbi = dbi;
	        dblist += '<option value=\"' + dbi +
		'\">' + data.database[i].desc + ' (' + sdbi + ')</option>\n';
	    }
	    dblist += '</select></td>\n';
	    $('#dblist').html(dblist)
	    $('#sversion').html("&nbsp;version " + data.version);
	    $('#db').on("change", newdb); // invoke newdb when db changes
	}
	else
	    alert_server_error();
	show_status(false);
    });
}

// Set up user interface event handlers.
function set_handlers() {
    $('#lwform').on("submit", false);      // disable form submission
    $(window).resize(resize_lightwave);
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
    // Handlers for buttons and other controls:
    //  on View/edit and Tables tabs:
    $('.go_to').on("click", go_to);      // go to selected location

    $('.sor').on("click", gostart);	 // go to start of record
    $('.rev').on("click", gorev);	 // go back by dt_sec and plot or print
    $('.scrollrev').on("click", autoplay_rev); // toggle reverse autoscrolling
    $('.scrollfwd').on("click", autoplay_fwd); // toggle forward autoscrolling
    $('.fwd').on("click", gofwd);	 // advance by dt_sec and plot or print
    $('.eor').on("click", goend);	 // go to end of record

    $('.srev').on("click", srev);	 // search for previous 'Find' target
    $('.find').on("click", find);	 // open/close 'Find' dialog
    $('.sfwd').on("click", sfwd);	 // search for next 'Find' target

    // signal window
    $('#plotdata').on("mousemove", function(e){ show_time(e.pageX, e.pageY); });

    $('.stretch').on("click", stretch_signal); // enlarge selected signal
    $('.reset').on("click", reset_signal);     // reset scale of selected signal
    $('.shrink').on("click", shrink_signal);   // reduce selected signal

    // editgroup buttons
    $('#add_type').on("click", toggle_add_typebox);
    $('#insert_mode').on("click", toggle_insert_mode);
    $('#jumpleft').on("click", jump_left);      // select annotation to left
    $('#nudgeleft').on("click", nudge_left);    // move left one increment
    $('#nudgeright').on("click", nudge_right);  // move left one increment
    $('#jumpright').on("click", jump_right);    // select annotation to left
    $('#undo').on("click", undo);    // restore state before most recent edit
    $('#mark').on("click", mark);    // complete the pending edit
    $('#redo').on("click", redo);    // reapply most recent edit

    // Signal window duration slider on View/edit tab
    $(function() {
	$('#dtslider').slider({ value: dt_sec, min: 0, max: 60, step: 5,
	    slide: function(event, ui) {
		if (ui.value < 5) ui.value = 1;
		$('#swidth').val(ui.value);
		dt_sec = ui.value;
		dt_ticks = dt_sec * tickfreq;
		if (dt_sec < 10) tickint = tickfreq;
		else if (dt_sec < 35) tickint = 5 * tickfreq;
		else tickint = 10 * tickfreq;
		m = document.getElementById("viewport").getScreenCTM();
		set_sw_width(dt_sec);
		go_here(t0_ticks);
	    }
	});
	$('#swidth').val(dt_sec);
    });

    // disable search buttons until a target has been defined
    $('.sfwd').attr('disabled', 'disabled');
    $('.srev').attr('disabled', 'disabled');

    // disable signal resize buttons until a signal has been selected
    $('.stretch').attr('disabled', 'disabled');
    $('.reset').attr('disabled', 'disabled');
    $('.shrink').attr('disabled', 'disabled');

    // hide edit controls unless editing
    $('.editgroup').hide();

    // Find... dialog box
    $('#findbox').dialog({autoOpen: false});

    // Add type to palette dialog box
    $('#add_typebox').dialog({autoOpen: false});

    // on Settings tab:
    $('[name=server]').on("change", set_server); // use another lightwave server
    $('#show_status').on("click", toggle_show_status);
    $('#show_requests').on("click", toggle_show_requests);
    $('#clear_requests').on("click", clear_requests);
    $('#editing').on("click", toggle_editing);
    $('#shortcuts').on("click", toggle_shortcuts);
    $('#new_annset').on("click", new_annset);
    $('#show_edits').on("click", toggle_show_edits);

    // on Help tab:
    $('#helpframe').attr('height', $(window).height() - 180 + 'px');
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
	var dbparts = db.split('/');
	if (dbparts.length > 1) sdb = '.../' + dbparts.pop();
	else sdb = db;
	if (record === '') {
	    var title = 'LightWAVE: ' + sdb;
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
	    var title = 'LW: ' + sdb + '/' + record;
	    document.title = title;
	    $('.t0_str').val(t0_string);
	    current_tab = 'View/edit';
	    help_main = 'followed-link.html';
	    $('.recann').html(sdb + '/' + record);
	    dblist =  '<td align=right>Database:</td><td>' + db + '</td>';
	    $('#server').html(server);
	    $('#dblist').html(dblist);
	    rlist =  '<td align=right>Record:</td><td>' + record + '</td>';
	    $('#rlist').html(rlist);
	    url = server + '?action=alist&callback=?&db=' + db;
	    show_status(true);
	    $.getJSON(url, function(data) {
		if (data.success) ann_set = data.annotator;
		else ann_set = '';
		read_annotations(t0_string);
		set_sw_width(dt_sec);
		show_status(false);
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
