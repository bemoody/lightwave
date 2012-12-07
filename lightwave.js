// file: lightwave.js	G. Moody	18 November 2012
//			Last revised:	30 November 2012  version 0.01
// LightWAVE Javascript code
//
// Copyright (C) 2012 George B. Moody
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
// this software, please visit PhysioNet (http://www.physionet.org/).
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

// retrieve the selected data and load them into the page
function fetchdata() {
    db = $('[name=db]').val();
    if (!db) { alert('Choose a database'); return false; }
    record = $('[name=record]').val();
    if (!record) { alert('Choose a record'); return false; }
    url = '/cgi-bin/lightwave?action=Retrieve&db=' + db
	+ '&record=' + record;
    $('[name=signal]').each(function() {
	if (this.checked) { url += '&signal=' + $(this).val(); }
    });
    annotator = $('[name=annotator]').val();
    if (annotator) { url += '&annotator=' + annotator; }
    t0 = $('[name=t0]').val();
    if (t0) { url += '&t0=' + t0; }
    dt = $('[name=dt]').val();
    if (dt) { url += '&dt=' + dt; }
    $.get(url, function(data) {
	$('#results').html(data);
	// the rest of this block is just a placeholder for the code to
	// generate the graphical output (not yet implemented)
	svg000 = "M 0,100 l 10,10 10,30 10,50 10,-90, 10,-10, 10,0";
	$('.s000').attr('d', svg000);
	svg001 = "M 0,100 l 10,-10 10,30 10,0 10,-40, 10,10, 10,0";
	$('.s001').attr('transform', 'translate(0,-30)')
	    .attr('stroke','blue').attr('d', svg001);
    });
};

// fetch the list of signals in the selected record, and load it into the page
function loadslist() {
    db = $('[name=db]').val();
    record = $('[name=record]').val();
    $.get('/cgi-bin/lightwave?action=slist&db=' + db
	+ '&record=' + record, function(data) {
	$('#slist').html(data);});
    loadinfo();	  
};

// fetch the signal info for the selected record, and load it into the page
function loadinfo() {
    db = $('[name=db]').val();
    record = $('[name=record]').val();
    $.get('/cgi-bin/lightwave?action=info&db=' + db
	  + '&record=' + record, function(data) {
	      $('#info').html(data);
	  });
};

// fetch the lists of records and annotators in the selected database, load them
// into the page, and set up an event handler for record selection
function loadrlist() {
    db = $('[name=db]').val();
    $('#slist').empty();
    $.get('/cgi-bin/lightwave?action=rlist&db=' + db, function(data) {
	$('#rlist').html(data);
	// fetch the list of signals when the user selects a record
	$('[name=record]').on("change", loadslist);
    });
    $.get('/cgi-bin/lightwave?action=alist&db=' + db, function(data) {
	$('#alist').html(data); });
};

// when the page is loaded, fetch the list of databases, load it into the page,
// and set up event handlers for database selection and form submission
$(document).ready(function(){
    // fetch the list of databases once the page has been loaded
    $.get('/cgi-bin/lightwave?action=dblist', function(data) {
	$('#dblist').html(data);
	// fetch the record and annotator lists when the user selects a database
	$('[name=db]').on("change", loadrlist);
    });
    $('#lwform').on("submit", false);      // disable form submission
    $('#retrieve').on("click", fetchdata); // get results using ajax instead
});
