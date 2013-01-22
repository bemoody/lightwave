// file: lightwave.js	G. Moody	18 November 2012
//			Last revised:	22 January 2013  version 0.32
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
var tfreq;      // ticks per second (LCM of sampling frequencies of signals)
var annotators = ''; // annotators for the selected database, from alist()
var ann = [];   // annotations read and cached by read_annotations()
var nann = 0;	// number of annotators, set by read_annotations()
var annselected = '';// name of annotator to be highlighted, if any
var signals;    // signals for the selected record, from slist()
var nsig = 0;	// number of signals, set by read_signals()
var sigselected = '';// name of signal to be highlighted, if any
var out_format; // 'plot' or 'text', set by button handler functions
var dt = 10;    // window width in seconds
var ts0 = -1;   // time of the first sample in the signal window, in samples
var tsf;	// time of the first sample after the signal window, in samples
var tpool = []; // cache of 'trace' objects (10-second signal segments)
var tid = 0;	// next trace id (all traces have id < tid)
var target = '';// search target, set in Find... dialog
var atarget = '';// annotator to be searched, set in Find... dialog
var g_visible = 1; // grid (1: on, 0: off)
var m_visible = 1; // annotation marker bars (1: on, 0: off)
var a_visible = [];
var s_visible = [];
var mag = [];   // magnification of signals in plots
var help_main = 'about.html';

// Initialize or expand tpool
function init_tpool(ntrace) {
    for (var i = tpool.length; i < ntrace; i++) {
	tpool[i] = {};
	tpool[i].id = tid++;
    }
}

// Replace the least-recently-used trace with the contents of s
function set_trace(db, record, s) {
    var idmin = tid, imin, j, len, p, v;

    // set properties of s that are not properties from server response
    s.id = tid++;
    s.db = db;
    s.record = record;

    // restore amplitudes from first differences sent by server
    len = s.samp.length;
    v = s.samp;
    for (j = p = 0; j < len; j++)
	p = v[j] += p;

    // find the least-recently-used trace
    for (var i = 0; i < tpool.length; i++) {
	if (tpool[i].id < idmin) {
	    imin = i;
	    idmin = tpool[i].id;
	}
    }
    tpool[imin] = s; // replace it
}

// Find a trace in the cache, if it exists
function find_trace(db, record, signame, t) {
    for (var i = 0; i < tpool.length; i++) {
	if (tpool[i].name == signame &&
	    tpool[i].t0 == t &&
	    tpool[i].record == record &&
	    tpool[i].db == db) {
	    return tpool[i];
	}
    }
    return null;
}

// Convert argument (in samples) to a string in HH:MM:SS format.
function timstr(t) {
    var ss = Math.floor(t/tfreq);
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
    var mmm = Math.floor(1000*t/tfreq) % 1000;
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
    return t*tfreq;
}

function show_tables() {
    var atext = '', itext = '', stext = '', ia, ii, is;

    itext += '<h3>Summary</h3>\n<table>\n'
        + ' <tr><td>Record length</td><td>' + recinfo.duration + '</td></tr>\n';
    if (recinfo.start) {
	itext += ' <tr><td>Start</td><td>' + recinfo.start + '</td></tr>\n'
	    + ' <tr><td>End</td><td>' + recinfo.end + '</td></tr>\n';
    }
    itext += ' <tr><td>Clock frequency&nbsp;</td><td>' + tfreq
	+ ' ticks per second</td></tr>\n';

    if (ann.length > 0) {
	for (ia = 0; ia < ann.length; ia++) {
	    itext += '<tr><td>Annotator: ' + ann[ia].name + '</td><td>'
		+ '(' + ann[ia].annotation.length + ' annotations)</td></tr>\n';
	}
    }
    if (signals.length > 0) {
	for (is = 0; is < signals.length; is++) {
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
    if (recinfo.info) {
	itext += '<tr><td style="vertical-align: top;">Notes</td><td><pre>';
	for (ii = 0; ii < recinfo.info.length; ii++) {
	    itext += recinfo.info[ii] + '\n';
	}
	itext += '</pre></td></tr>\n';
    }
    itext += '</table>';
    $('#info').html(itext);

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
		+ '<th>Time (elapsed)&nbsp;</th><th>Type</th><th>Sub&nbsp;</th>'
		+ '<th>Chan</th><th>Num&nbsp;</th><th>Aux</th></tr>\n';
	    for (var i = 0; i < a.length; i++) {
		if (a[i].t < ts0) continue;
		else if (a[i].t > tsf) break;
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
    $('#textdata').html(atext);

    if (signals.length > 0) {
	var sig = [];
	for (i = is = 0; i < signals.length; i++) {
	    var sname = signals[i].name;
	    if (s_visible[sname])
		sig[is++] = find_trace(db, record, sname, ts0);
	}

	stext = '<h3>Signals</h3>\n';
	stext += '<p><table class="dtable">\n<tr><th>Time (elapsed)&nbsp;</th>';
	for (i = 0; i < is; i++)
	    stext += '<th>' + sig[i].name + '&nbsp;</th>';
	stext += '\n<tr><th></th>';
	for (i = 0; i < is; i++) {
	    u = sig[i].units;
	    if (!u) u = '[mV]';
	    stext += '<th><i>(' + u + ')</i></th>';
	}
	var t = ts0;
	for (var i = 0; t < tsf; i++, t++) {
	    stext += '</tr>\n<tr><td>' + mstimstr(t);
	    for (var j = 0; j < is; j++) {
		stext += '</td><td>';
		if (t%sig[j].tps == 0) {
		    v = (sig[j].samp[i/sig[j].tps]-sig[j].base)/
			sig[j].gain;
		    stext += v.toFixed(3);
		}
	    }
	    stext += '</td>';
	}
	stext += '</tr>\n</table>\n';
    }
    $('#textdata').append(stext);
}

function show_plot() {
    var width = $('#plotdata').width();
    var height = width*0.525;
    // calculate baselines for signals and annotators
    var dy = Math.round(5000/(nsig + nann + 1));
    var y = dy;
    var y0s = [];	// signal baselines
    var y0a = [];	// annotator baselines
    var ia = 0, is = 0;
    while (is < nsig || ia < nann) {
	if (is < nsig) { y0s[is] = y; y += dy; is++; }
	if (ia < nann) { y0a[ia] = y; y += dy; ia++; }
    }

    var svg = '<br><svg xmlns=\'http://www.w3.org/2000/svg\''
	+ ' xmlns:xlink=\'http:/www.w3.org/1999/xlink\' class="svgplot"'
	+ ' width="' + width + '" height="' + height
	+ '" preserveAspectRatio="xMidYMid meet">\n';
    svg += '<g id="viewport" '
	+ 'transform="scale(' + width/11500 + '),translate(1000,100)">\n';

    // background grid
    var grd = '<g id="grid">\n';
    grd += '<circle cx="-120" cy="5000" r="50" stroke="rgb(200,100,100)"'
        + ' stroke-width="4" fill="red" fill-opacity="' + g_visible + '"/>';
    if (g_visible == 0) {
	grd += '<title>(click to show grid)</title></g>';
    }
    else {
	grd += '<title>(click to hide grid)</title>'
	    + '<path stroke="rgb(200,100,100)" fill="red" stroke-width="4"'
	    + ' d="M0,0 ';
	for (var x = 0; x <= 10000; x += 200) {
	    if (x%1000 == 0)
		grd += 'l0,5000 l-20,100 l40,0 l-20,-100 m200,-5000 ';
	    else
		grd += 'l0,5000 m200,-5000 ';
	}
	grd += 'M0,0 '
	for (var y = 0; y <= 5000; y += 200)
	    grd += 'l10000,0 m-10000,200 ';
	grd += '" /></g>\n';
    }

    // timestamps
    var tsm = (ts0 + +tsf)/2;
    tst = '<g id="times">\n<text x="0" y="5200" font-size="100" fill="red"'
	+ ' style="text-anchor: middle;">' + timstr(ts0) + '</text>\n'
	+ '<text x="5000" y="5200" font-size="100" fill="red"'
	+ ' style="text-anchor: middle;">' + timstr(tsm) + '</text>\n'
	+ '<text x="10000" y="5200" font-size="100" fill="red"'
	+ ' style="text-anchor: middle;">' + timstr(tsf) + '</text>\n</g>\n';
    
    // annotator names and annotations
    sva = '<g id="mrkr">\n';
    sva += '<circle cx="-120" cy="0" r="50" stroke="rgb(0,0,200)"'
        + ' stroke-width="4" fill="blue" fill-opacity="' + m_visible + '"/>'
    if (m_visible == 0) sva += '<title>(click to show marker bars)</title>';
    else sva += '<title>(click to hide marker bars)</title>';
    for (ia = 0; ia < nann; ia++) {
	var y0 = y0a[ia];
	var aname = ann[ia].name;
	sva += '<g id="ann;;' + aname + '">\n';
	if (a_visible[aname] == 1) {
	    sva += '<title>' + ann[ia].desc + ' (click to hide)</title>'
		+ '<text x="-50" y="' + y0 + '"';
	    if (aname == annselected)
		sva += ' font-weight="bold"';
	    sva += ' font-size="120" fill="blue" font-style="italic"'
		+ ' style="text-anchor: end; dominant-baseline: middle">'
		+ aname + '</text>\n';
	    var a = ann[ia].annotation;
	    for (var i = 0; i < a.length; i++) {
		if (a[i].t < ts0) continue;
		else if (a[i].t > tsf) break;
		var x, y, y1, txt;
		x = Math.round((a[i].t - ts0)*1000/tfreq);
		if (a[i].x && (a[i].a == '+' || a[i].a == '"')) {
		    if (a[i].a == '+') y = y0+120;
		    else y = y0-120;
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
			+ '" d="M' + x + ',0 l-20,-100 l40,0 l-20,100 V' + y1
			+ ' m0,210 V5000" />\n';
		}
		sva += '<text x="' + x + '" y="' + y
		    + '" style="text-anchor: middle;"';
		if (aname == annselected)
		    sva += ' font-weight="bold"';
		sva += ' font-size="120" fill="rgb(0,0,200)">'
		    + txt + '</text>\n'; 
	    }
	}
	else {
	    sva += '<title>' + ann[ia].desc + ' (click to view)</title>'
		+ '<text x="-50" y="' + y0 + '"'
		+ ' font-size="120" fill="rgb(150,150,200)" font-style="italic"'
		+ ' style="text-anchor: end; dominant-baseline: middle">'
		+ aname + '</text>\n';
	}
	sva += '</g>\n';
    }

    // signal names and traces
    svs = '';
    for (is = 0; is < nsig; is++) {
	var y0 = y0s[is];
	var sname = signals[is].name;
	var trace = find_trace(db, record, sname, ts0);
	
	svs += '<g id="sig;;' + sname + '">\n';
	if (trace && s_visible[sname] == 1) {
	    svs += '<title>' + sname + ' (click to hide)</title>' 
		+ '<text x="-50" y="' + y0 + '"';
	    if (sname == sigselected)
		svs += ' font-weight="bold"';
	    svs += ' font-size="120" fill="black" font-style="italic"'
		+ ' style="text-anchor: end; dominant-baseline: middle">'
		+ sname + '</text>\n';
	    var s = trace.samp;
	    var g = (-400*mag[sname]/(trace.scale*trace.gain));
	    var z = trace.base*g - y0;
	    var v = Math.round(g*s[0] - z);
	    // move to start of trace
	    svs += '<path stroke="black" fill="none" stroke-width="';
	    if (sname == sigselected)
		svs += '10';
	    else
		svs += '6';
	    svs += '" d="M0,' + v + ' L';
	    var t = 0;
	    var tps = trace.tps;
	    var tmax = s.length * tps;
	    var ts = 1000/tfreq;
	    if (tmax > dt * tfreq) tmax = dt * tfreq;
	    // add remaining samples to the trace
	    for (var i = 0; t < tmax; i++, t += tps) {
		v = Math.round(g*s[i] - z);
		svs += ' ' + t*ts + ',' + v;
	    }
	    svs += '" />\n';
	}
	else {	// signal is hidden, show label only
	    svs += '<title>' + sname + ' (click to view)</title>'
		+ '<text x="-50" y="' + y0 + '"'
		+ ' font-size="120" fill="rgb(128,128,128)" font-style="italic"'
		+ ' style="text-anchor: end; dominant-baseline: middle">'
		+ sname + '</text>\n';
	}
	svs += '</g>\n';
    }

    svg += grd + tst + sva + svs + '</g></svg>\n';
    $('#plotdata').html(svg);
    // Handle user input in the signal window
    $('svg').svgPan('viewport');

    $('svg').mousemove(function(e){
	var x = e.pageX;
	show_time(x);
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
	read_signals(ts0, true);
	show_plot();
    });
}

function update_output() {
    if (out_format == 'plot') show_plot();
    else if (out_format == 'text') show_tables();
}

// Retrieve one or more complete annotation files for the selected record.
function read_annotations() {
    nann = 0;	// new record -- (re)fill the cache
    if (annotators.length) {
	var annreq = '', i;
	for (i = 0; i < annotators.length; i++)
	    annreq += '&annotator=' + annotators[i].name;
	url = server + '?action=fetch&db=' + db + '&record=' + record + annreq
	    + '&dt=0&callback=?';
	$.getJSON(url, function(data) {
	    for (i = 0; i < data.fetch.annotator.length; i++, nann++) {
		ann[nann] = data.fetch.annotator[i];
		a_visible[ann[nann].name] = 1;
		ann[nann].opacity = 1;
		for (var j = 0; j < annotators.length; j++)
		    if (ann[nann].name == annotators[j].name)
			ann[nann].desc = annotators[j].desc;
	    }
	});
    }
}

// Retrieve one or more signal segments starting at t for the selected record.
function read_signals(t, update) {
    var i, trace = '', sigreq = '';

    if (!signals) return;
    for (i = 0; i < signals.length; i++) {
	if (s_visible[signals[i].name] == 1) {
	    trace = find_trace(db, record, signals[i].name, t);
	    if (trace) {
		trace.id = tid++;	// found, mark as recently used
	    }
	    else sigreq += '&signal=' + signals[i].name;  // add to request
	}
    }

    if (sigreq) {
	url = server + '?action=fetch&db='
	    + db + '&record=' + record + sigreq
	    + '&t0=' + t/tfreq + '&dt=' + dt + '&callback=?';
	$.getJSON(url, function(data) {
	    var s = data.fetch.signal;
	    for (i = 0; i < s.length; i++)
		set_trace(db, record, s[i]);
	    if (update) update_output();
	});
    }
    else if (update) update_output();
}

// Handle a request for data to display as a plot or tables.
function fetch() {
    var title = 'LW: ' + db + '/' + record;
    document.title = title;
    var t0 = $('[name=t0]').val();
    ts0 = strtim(t0);
    tsf = ts0 + dt*tfreq;
    read_signals(ts0, true); // read signals not previously cached, if any
}

// Button handlers
function fetch_plot() {
    out_format = 'plot';
    fetch();
}

function fetch_text() {
    out_format = 'text';
    fetch();
}

function go_here(t) {
    var tf = strtim(recinfo.duration);
    if (t >= tf) { t = tf; $('.fwd').attr('disabled', 'disabled'); }
    else { $('.fwd').removeAttr('disabled'); }
    if (t <= 0) { t = 0; $('.rev').attr('disabled', 'disabled'); }
    else { $('.rev').removeAttr('disabled'); }
    var t0 = timstr(t);
    $('[name=t0]').val(t0);
    if (out_format == 'text') fetch();
    else fetch_plot();
    if (tsf >= tf) { $('.fwd').attr('disabled', 'disabled'); }
}

function gostart() {
    go_here(0);
}

function gorev() {
    var t0 = $('[name=t0]').val();
    var t = strtim(t0) - dt*tfreq;
    go_here(t);
    t -= dt*tfreq;
    if (t >= 0) read_signals(t, false);  // prefetch the previous window
}
	 
function go_to() {
    var t0 = $('[name=t0]').val();
    var t = strtim(t0);
    go_here(t);
}

function gofwd() {
    var t0 = $('[name=t0]').val();
    var t = strtim(t0) + dt*tfreq;
    go_here(t);
    t += dt*tfreq;
    if (t < strtim(recinfo.duration))
	read_signals(t, false);	  // prefetch the next window
}

function goend() {
    var t = Math.floor((strtim(recinfo.duration)-1)/(dt*tfreq));
    go_here(t*dt*tfreq);
}

function srev() {
    var na = 0, sa = '', i;

    for (i = 0; i < nann; i++) {
	if (ann[i].name == atarget) {
	    sa = ann[i].annotation;
	    na = sa.length;
	    break;
	}
    }
    if (i >= nann) return;

    for (i = na - 1; i >= 0 && sa[i].t > ts0; i--)
	;

    for ( ; i >= 0 && sa[i].a != target; i--)
	;

    if (i >= 0) {
	var t = sa[i].t - (sa[i].t % (dt * tfreq));
	go_here(t);
    }
    else alert(target + ' not found in ' + atarget + ' before ' + timstr(ts0));
}

function sfwd() {
    var na = 0, sa = '', i;

    for (i = 0; i < nann; i++) {
	if (ann[i].name == atarget) {
	    sa = ann[i].annotation;
	    na = sa.length;
	    break;
	}
    }
    if (i >= nann) return;

    for (i = 0; i < na && sa[i].t < tsf; i++)
	;

    for ( ; i < na && sa[i].a != target; i++)
	;

    if (i < na) {
	var t = sa[i].t - (sa[i].t % (dt * tfreq));
	go_here(t);
    }
    else alert(target + ' not found in ' + atarget + ' after ' + timstr(tsf));
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
	for (var i = 0; i < annotators.length; i++) {
	    content += '<option value=\"' + annotators[i].name + '\"';
	    if (atarget === annotators[i].name) {
		content += ' selected';
	    }
	    content += '>' + annotators[i].name + '</option>\n';
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
	    else atarget = annotators[0].name;
	}
    });
    $('#findbox').dialog({
	close: function(event, ui){
	    $('.srev').removeAttr('disabled');
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
    var t = ts0 + (x - m.e)*tfreq/(1000*m.a);
    if (t < ts0) t = ts0;
    else if (t > tsf) t = tsf;
    var ts = mstimstr(t);
    $('.pointer').html(ts);
}

// Load the list of signals for the selected record.
function slist(t0) {
    var title = 'LW: ' + db + '/' + record, t = 0;
    $('.recann').html(db + '/' + record);
    document.title = title;
    $('#info').empty();
    $('#textdata').empty();
    $('#plotdata').empty();
    var url = server + '?action=info&db=' + db + '&record=' + record
	+ '&callback=?';
    nsig = 0;
    $.getJSON(url, function(data) {
	if (data) {
	    recinfo = data.info;
	    tfreq = recinfo.tfreq;
	    if (recinfo.signal) {
		signals = recinfo.signal;
		nsig = signals.length;
		for (var i = 0; i < nsig; i++)
		    s_visible[signals[i].name] = mag[signals[i].name] = 1;
		init_tpool(nsig * 4);
	    }
	}
	$('#tabs').tabs("enable");
	$('#tabs').tabs("select", "#view");
	out_format = 'plot';
	if (t0 != '') t = strtim(t0);
	t0 = timstr(t);
	$('[name=t0]').val(t0);
	go_here(t);
	$("body").show();
    });
};

// When a new record is selected, reload signals and show the first 10 seconds.
function newrec() {
    record = $('[name=record]').val();
     var prompt = 'Reading annotations for ' + db + '/' + record;
    $('#prompt').html(prompt);
    read_annotations();
    slist("0");
    prompt = 'Click on the <b>View/edit</b> tab to view ' + db + '/' + record;
    $('#prompt').html(prompt);
}

// Load the list of annotators in the selected database.
function alist() {
    url = server + '?action=alist&callback=?&db=' + db;
    $.getJSON(url, function(data) {
	if (data) annotators = data.annotator;
	else annotators = '';
    });
};

// Load the list of records in the selected database, and set up an event
// handler for record selection.
function rlist() {
    var rlist = '';
    url = server + '?action=rlist&callback=?&db=' + db;
    $('#rlist').html('Reading list of records in ' + db);
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
    $('#textdata').empty();
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
	}
    });
    // Button handlers
    //  on View/edit and Tables tabs:
    $('#fplot').on("click", fetch_plot);   // get data and plot them
    $('#ftext').on("click", fetch_text);   // get data and print them
    $('.fwd').on("click", gofwd);	   // advance by dt and plot or print
    $('[name=t0]').on("blur", go_to);      // go to selected location
    $('.rev').on("click", gorev);	   // go back by dt and plot or print
    $('.sor').on("click", gostart);	   // go to start of record
    $('.eor').on("click", goend);	   // go to end of record
    $('.srev').on("click", srev);	   // search for previous 'Find' target
    $('.sfwd').on("click", sfwd);	   // search for next 'Find' target
    $('.find').on("click", find);	   // open 'Find' dialog
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

    // on Settings tab:
    $('[name=server]').on("change", set_server);      // go to selected location

    // on Help tab:
    $('#help_about').on("click", help);    // return to 'about' (main help doc)
    $('#help_topics').on("click", help_topics);  // show help topics
    $('#help_contacts').on("click", help_contacts); // show contacts
}

// Check for query string in URL, decode and run query or queries if present
function parse_url() {
    var s = window.location.href.split("?");
    var n = s.length, t = 0, t0 = '0';
    if (n != 2) {
	$('#tabs').tabs({disabled:[1,2]});  // disable the View and Tables tabs
	$("body").show();
	$('[name=server]').val(server);     // set default server URL
	dblist();	// no query, get the list of databases
	return;
    }
    var q = s[1].split("&");
    for (n = 0; n < q.length; n++) {
	var v = q[n].split("=");
	if (v[0] == 'db') db = v[1];
	else if (v[0] == 'record') record = v[1];
	else if (v[0] == 't0') t0 = v[1];
    }
    if (db !== '') {
	if (record === '') {
	    var title = 'LightWAVE: ' + db;
	    document.title = title;
	    $('#tabs').tabs({disabled:[1,2]});  // disable View and Tables tabs
	    $("body").show();
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
	    help_main = 'followed-link.html';
	    $('.recann').html(db + '/' + record);
	    dblist =  '<td align=right>Database:</td><td>' + db + '</td>';
	    $('#server').html(server);
	    $('#dblist').html(dblist);
	    rlist =  '<td align=right>Record:</td><td>' + record + '</td>';
	    $('#rlist').html(rlist);
	    url = server + '?action=alist&callback=?&db=' + db;
	    $.getJSON(url, function(data) {
		if (data) annotators = data.annotator;
		else annotators = '';
		url = server + '?action=info&db=' + db + '&record=' + record
		    + '&callback=?';
		nann = 0;	// new record -- (re)fill the cache
		if (annotators.length) {
		    var annreq = '', i;
		    for (i = 0; i < annotators.length; i++)
			annreq += '&annotator=' + annotators[i].name;
		    url = server + '?action=fetch&db=' + db + '&record='
			+ record + annreq + '&dt=0&callback=?';
		    $.getJSON(url, function(data) {
			for (i = 0; i < data.fetch.annotator.length; i++) {
			    ann[nann] = data.fetch.annotator[i];
			    a_visible[ann[nann].name] = 1;
			    ann[nann].opacity = 1;
			    for (var j = 0; j < annotators.length; j++)
				if (ann[nann].name == annotators[j].name)
				    ann[nann].desc = annotators[j].desc;
			    nann++;
			}
			slist(t0);
		    });
		}
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
