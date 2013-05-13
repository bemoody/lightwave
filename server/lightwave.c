/* file: lightwave.c	G. Moody	18 November 2012
			Last revised:	  13 May 2013  version 0.62
LightWAVE server
Copyright (C) 2012-2013 George B. Moody

This program is free software; you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation; either version 2 of the License, or (at your option) any later
version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE.  See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with
this program; if not, write to the Free Software Foundation, Inc., 59 Temple
Place - Suite 330, Boston, MA 02111-1307, USA.

You may contact the author by e-mail (george@mit.edu) or postal mail
(MIT Room E25-505A, Cambridge, MA 02139 USA).  For updates to this software,
please visit PhysioNet (http://www.physionet.org/).
_______________________________________________________________________________

LightWAVE is a lightweight waveform and annotation viewer and editor.

LightWAVE is modelled on WAVE, an X11/XView application I wrote and
maintained between 1989 and 2012.  LightWAVE runs within any modern
web browser and does not require installation on the user's computer.

This file contains the main server-side code, which uses the WFDB library
(http://physionet.org/physiotools/wfdb.shtml) to handle AJAX requests from the
LightWAVE client.  CGI interaction with the web server is handled by libcgi
(http://libcgi.sourceforge.net/).  The WFDB library uses libcurl
(http://curl.haxx.se/libcurl/) to retrieve data from another web server (if the
data are not stored locally) before reformatting and forwarding them to the
LightWAVE client.
_______________________________________________________________________________

*/

#include <stdio.h>
#include <stdlib.h>
#include <libcgi/cgi.h>
#include <wfdb/wfdblib.h>
#include "setrepos.c"

#ifndef LWDIR
#define LWDIR "/home/physionet/html/lightwave"
#endif

#ifndef BUFSIZE
#define BUFSIZE 1024	/* bytes read at a time */
#endif

/* MFNLEN is the max length of a WFDB filename, defined in wfdb/lib/wfdbio.c. */
#define MFNLEN	1024

/* NAMAX is the maximum number of annotators that fetchannotations() will
attempt to read at one time.  The value is arbitrary and can be increased
if necessary.  Ideally, if NAMAX annotators are displayed simultaneously
in LightWAVE's signal window, the user should be able to read all of them. */
#define NAMAX	16

/* TOL is the tolerance for error in approx_LCM, which is used to find the
(approximate) least common multiple of sampling frequencies that may not
be integers.  The default value of 0.001 means that the maximum error is
one part in a thousand (0.1%). */
#define TOL	0.001

static char *action, *annotator[NAMAX], buf[BUFSIZE], *db, *record, *recpath,
    **sname, wfdb_filename[MFNLEN];
static int interactive, nann, nsig, nosig, *sigmap;
WFDB_FILE *ifile;
WFDB_Frequency ffreq, tfreq;
WFDB_Sample *v;
WFDB_Siginfo *s;
WFDB_Time t0, tf, dt;

char *get_param(char *name), *get_param_multiple(char *name), *strjson(char *s);
double approx_LCM(double x, double y);
int  fetchannotations(void), fetchsignals(void), ufindsig(char *name);
void dblist(void), rlist(void), alist(void), info(void), fetch(void),
    force_unique_signames(void), print_file(char *filename),
    jsonp_end(void), lwpass(void), lwfail(char *error_message), pnwcheck(void),
    prep_signals(void), map_signals(void), prep_annotations(void),
    prep_times(void), cleanup(void);

int main(int argc, char **argv)
{
    static char *callback = NULL, *user;
    int i;
    extern int headers_initialized;

    if (argc < 2) {  /* normal operation as a CGI application */
	cgi_init();
	atexit(cgi_end);
       	cgi_process_form();
	printf("Content-type: application/javascript; charset=utf-8\r\n\r\n");
    }
    else
        interactive = 1;  /* interactive mode for debugging */
    wfdbquiet();	  /* suppress WFDB library error messages */
    atexit(cleanup);	/* release allocated memory before exiting */

    /* Define data sources to be accessed via this server. */
    setrepos();		/* function defined in "setrepos.c" */

    if (!(action = get_param("action"))) {
	print_file(LWDIR "/doc/about.txt");
	exit(0);
    }

    if (!interactive && (callback = get_param("callback"))) {
	printf("%s(", callback);	/* JSONP:  "wrap" output in callback */
	atexit(jsonp_end);	/* close the output with ")" before exiting */
    }

    if (strcmp(action, "dblist") == 0)
	dblist();

    else if ((db = get_param("db")) == NULL)
	lwfail("Your request did not specify a database");
  
    else if (strcmp(action, "rlist") == 0)
	rlist();

    else if (strcmp(action, "alist") == 0)
	alist();

    else if ((record = get_param("record")) == NULL)
	lwfail("Your request did not specify a record");

    else if (strcmp(action, "info") == 0)
	info();

    else if (strcmp(action, "fetch") == 0)
	fetch();

    else
	lwfail("Your request did not specify a valid action");

    exit(0);
}

void prep_signals()
{
    int n;

    SUALLOC(recpath, strlen(db) + strlen(record) + 2, sizeof(char));
    sprintf(recpath, "%s/%s", db, record);

    /* Discover the number of signals defined in the header, allocate
       memory for their signal information structures, open the signals. */
    if ((nsig = isigopen(recpath, NULL, 0)) > 0) {
	SUALLOC(s, nsig, sizeof(WFDB_Siginfo));
	nsig = isigopen(recpath, s, nsig);
    } 
    else {
	tfreq = ffreq = sampfreq(NULL);
	return;
    }

    /* Shorten signal names of the form "record xxx, signal N" to "v[N]" */
    for (n = 0; n < nsig; n++) {
	if (strncmp(s[n].desc, "record ", 7) == 0)
	    sprintf(s[n].desc, "v[%d]", n);
    }

    /* Make reasonably sure that signal names are distinct (see below). */
    force_unique_signames();

    /* Find the least common multiple of the sampling frequencies (which may not
       be exactly expressible as floating-point numbers).  In WFDB-compatible
       records, all signals are sampled at the same frequency or at a multiple
       of the frame frequency, but (especially in EDF records) there may be many
       samples of each signal in each frame.  The for loop below sets the "tick"
       frequency, tfreq, to the number of instants in each second when at least
       one sample is acquired. */
    setgvmode(WFDB_LOWRES);
    ffreq = sampfreq(NULL);
    if (ffreq <= 0.) ffreq = WFDB_DEFFREQ;
    for (n = 0, tfreq = ffreq; n < nsig; n++)
	tfreq = approx_LCM(ffreq * s[n].spf, tfreq);
}   

void lwpass()
{
    printf("  \"success\": true\n}\n");
}

void lwfail(char *error_message)
{
    char *p = strjson(error_message);

    printf("{\n  \"success\": false,\n  \"error\": %s\n}\n", p);
    SFREE(p);
}

void map_signals()
{
    char *p;
    int n;

    SUALLOC(sigmap, nsig, sizeof(int));
    for (n = 0; n < nsig; n++)
	sigmap[n] = -1;
    while (p = get_param_multiple("signal")) {
	if ((n = ufindsig(p)) >= 0) {
	    sigmap[n] = n; n++; nosig++;
	}
    }
}

void prep_annotators()
{
    char *p;

    while (nann < NAMAX && (p = get_param_multiple("annotator"))) {
	SSTRCPY(annotator[nann], p);
	nann++;
    }
}

void prep_times()
{
    char *p;

    if ((p = get_param("t0")) == NULL) p = "0";
    if ((t0 = strtim(p)) < 0L) t0 = -t0;
    if ((p = get_param("dt")) == NULL) p = "1";
	
    /* dt is the amount of data to be retrieved.  On input, dt is in seconds,
       but the next block of code converts it to sample intervals.  There are
       several special cases:

       * If dt is 0 or negative, no samples are retrieved, but all annotations
       are retrieved.

       * If dt is positive but less than 1 sampling interval, it is set to 1
       sampling interval.  This occurs for records with very low sampling rates,
       such as once per minute.

       * Otherwise, if dt is longer than 2 minutes and longer than 120000 sample
       intervals, it is reduced to 2 minutes, to limit the load on the server
       from a single request.
    */
    dt = atoi(p);
    if (dt <= 0) dt = 0;
    else {
	dt *= ffreq;
	if (dt < 1) dt = 1;
	else if (dt > 120*ffreq && dt > 120000) dt = 120*ffreq;
    }
    tf = t0 + dt;
}

/* Find the (approximate) least common multiple of two positive numbers
   (which are not necessarily integers). */
double approx_LCM(double x, double y)
{
    double x0 = x, y0 = y, z;

    if (x <= 0. || y <= 0.) return (0.);	/* this shouldn't happen! */
    while (-TOL > (z = x/y - 1) || z > TOL) {
	if (x < y) x+= x0;
	else y += y0;
	/* when x and y are nearly equal, z is close to zero */
    }
    return (x);
}

/* Prompt for input, read a line from stdin, save it, return a pointer to it. */
char *prompt(char *prompt_string)
{
    char *p = NULL;

    fprintf(stderr, "%s: ", prompt_string);
    fflush(stderr);
    buf[0] = '\0';  /* clear previous content in case of EOF on stdin */
    if (fgets(buf, sizeof(buf), stdin)) {
        buf[strlen(buf)-1] = '\0';  /* discard trailing newline */
	if (buf[0])
	    SSTRCPY(p, buf);
    }
    return (p); /* Yes, it's a memory leak.  So sue me! */
}

/* Read a single-valued parameter interactively or from form. */
char *get_param(char *name)
{
    if (interactive) return prompt(name);
    else return cgi_param(name);
}

/* Read next value of a multi-valued parameter interactively or from form. */
char *get_param_multiple(char *name)
{
    if (interactive) return prompt(name);
    else return cgi_param_multiple(name);
}

/* Convert a string to a JSON quoted string.  Note that newlines and other
control characters that cannot appear in JSON strings are converted to
spaces.  IMPORTANT:  the caller must free the string after use to avoid
memory leaks! */
char *strjson(char *s)
{
    char *js;
    int i, imax, j, q;

    /* Get the length of the input string and count the characters that must
       be escaped in it. */
    for (i = q = 0; s[i]; i++) {
	if (s[i] == '"' || s[i] == '\\') q++;
	else if (s[i] < ' ') s[i] = ' ';
    }    
    imax = i;

    /* Allocate memory for the output string. */
    SUALLOC(js, i+q+3, sizeof(char));

    /* Wrap the input string with '"' characters and escape any '"' characters
       embedded within it. */
    js[0] = '"';
    for (i = 0, j = 1; i < imax; i++, j++) {
	if (s[i] == '"' || s[i] == '\\') js[j++] = '\\';
	js[j] = s[i];
    }
    js[j++] = '"';
    js[j] = '\0';
    return (js);
}

void print_file(char *filename)
{
    FILE *ifile = fopen(filename, "r");

    if (ifile == NULL) {
	printf("lightwave: can't open %s\n", filename);
	return;
    }
    while (fgets(buf, sizeof(buf), ifile))
	fputs(buf, stdout);
    fclose(ifile);
}

void jsonp_end(void)
{
    printf(")");
    return;
}

void dblist(void)
{
    char *next, *wfdb = getwfdb();
    int first = 1;
   
    while (*wfdb) {
	/* Isolate the next component of the WFDB path. */
	for (next = wfdb; *next && next - wfdb < MFNLEN - 6; next++)
	    if (*next == ' ') { *next++ = '\0'; break; }
	/* Look for a "DBS" file in the next possible location. */
	sprintf(wfdb_filename, "%s/DBS", wfdb);
	if ((ifile = wfdb_fopen(wfdb_filename, "rb")) != NULL) {
	    if (first) printf("{ \"database\": [\n");
	    while (wfdb_fgets(buf, sizeof(buf), ifile)) {
		char *p, *name, *desc;

		for (p = buf; p < buf + sizeof(buf) && *p != '\t'; p++)
		    ;
		if (*p != '\t') continue;
		*p++ = '\0';
		while (p < buf + sizeof(buf) - 1 && *p == '\t')
		    p++;
		p[strlen(p)-1] = '\0';
		if (!first) printf(",\n");
		else first = 0;
		name = strjson(buf);
		desc = strjson(p);
		printf("    { \"name\": %s,\n      \"desc\": %s\n    }",
		       name, desc);
		SFREE(desc);
		SFREE(name);
	    }
	    wfdb_fclose(ifile);
	    first = 0; /* ensure that the database array will be closed in the
			  output even if the DBS file was empty */
	}
	wfdb = next;  /* prepare to search the next location in the WFDB path */
    }
    if (!first) {
	printf("\n  ],\n");
	printf("  \"version\": \"%s\",\n", LWVER);
        lwpass();
    }
    else {
	lwfail("The list of databases could not be read");
    }
}

void rlist(void)
{
    sprintf(buf, "%s/RECORDS", db);
    if (ifile = wfdb_open(buf, NULL, WFDB_READ)) {
	char *p;
        int first = 1;

        printf("{ \"record\": [\n");
	while (wfdb_fgets(buf, sizeof(buf), ifile)) {
	    buf[strlen(buf)-1] = '\0';
	    if (!first) printf(",\n");
	    else first = 0;
	    printf("    %s", p = strjson(buf));
	    SFREE(p);
	}
	printf("\n  ],\n");
	lwpass();
	wfdb_fclose(ifile);
    }
    else
	lwfail("The list of records could not be read");
}

void alist(void)
{
    char *next, *wfdb = getwfdb();
    int first = 1, mfnlen = MFNLEN - strlen(db) - 12;
   
    while (*wfdb) {
	/* Isolate the next component of the WFDB path. */
	for (next = wfdb; *next && next - wfdb < mfnlen; next++)
	    if (*next == ' ') { *next++ = '\0'; break; }
	/* Look for an "ANNOTATORS" file in the next possible location. */
	sprintf(wfdb_filename, "%s/%s/ANNOTATORS", wfdb, db);
	if (ifile = wfdb_fopen(wfdb_filename, "rb")) {
	    if (first) printf("{ \"annotator\": [\n");
	    while (wfdb_fgets(buf, sizeof(buf), ifile)) {
		char *p, *name, *desc;

		for (p = buf; p < buf + sizeof(buf) && *p != '\t'; p++)
		    ;
		if (*p != '\t') continue;
		*p++ = '\0';
		while (p < buf + sizeof(buf) - 1 && *p == '\t')
		    p++;
		p[strlen(p)-1] = '\0';
		if (!first) printf(",\n");
		else first = 0;
		name = strjson(buf);
		desc = strjson(p);
		printf("    { \"name\": %s,\n      \"desc\": %s\n    }",
		       name, desc);
		SFREE(desc);
		SFREE(name);
	    }
	    wfdb_fclose(ifile);
	    first = 0; /* ensure that the annotator array will be closed in the
			  output even if the ANNOTATORS file was empty */
	}
	wfdb = next;  /* prepare to search the next location in the WFDB path */
    }
    if (!first) {
	printf("\n  ],\n");
	lwpass();
    }
    else
	lwfail("The list of annotators could not be read");
}

void info(void)
{
    char *info, *p;
    int i;
    WFDB_Time t;

    prep_signals();
    if (nsig < 0) {
	lwfail("The '.hea' file could not be read");
	return;
    }
    printf("{ \"info\":\n");
    printf("  { \"db\": %s,\n", p = strjson(db)); SFREE(p);
    printf("    \"record\": %s,\n", p = strjson(record)); SFREE(p);
    printf("    \"tfreq\": %g,\n", tfreq);
    p = timstr(0);
    if (*p == '[') {
        printf("    \"start\": \"%s\",\n", mstimstr(0L));
	printf("    \"end\": \"%s\",\n", mstimstr(-strtim("e")));
    }
    else {
        printf("    \"start\": null,\n");
	printf("    \"end\": null,\n");
    }
    t = strtim("e");
    if (t > (WFDB_Time)0) {
	p = mstimstr(t);
	while (*p == ' ') p++;
	printf("    \"duration\": \"%s\",\n", p);
    }
    else
	printf("    \"duration\": null,\n");

    if (nsig > 0) {
	printf("    \"signal\": [\n");
	for (i = 0; i < nsig; i++) {
	    printf("      { \"name\": %s,\n", p = strjson(sname[i])); SFREE(p);
	    printf("        \"tps\": %g,\n", tfreq/(ffreq*s[i].spf));
	    if (s[i].units) {
		printf("        \"units\": %s,\n", p = strjson(s[i].units));
		SFREE(p);
	    }
	    else
		printf("        \"units\": null,\n");
	    printf("        \"gain\": %g,\n",
		   s[i].gain ? s[i].gain : WFDB_DEFGAIN);
	    printf("        \"adcres\": %d,\n", s[i].adcres);
	    printf("        \"adczero\": %d,\n", s[i].adczero);
	    printf("        \"baseline\": %d\n", s[i].baseline);
	    printf("      }%s", i < nsig-1 ? ",\n" : "\n    ],\n");
	}
    }
    else
	printf("    \"signal\": null,\n");

    if (info = getinfo(recpath)) {
	printf("    \"note\": [\n      %s", p = strjson(info));
	while (info = getinfo((char *)NULL)) {
	    printf(",\n      %s", p = strjson(info));
	    SFREE(p);
	}
	printf("\n    ]\n");
    }
    else
	printf("    \"note\": null\n");

    printf("  },\n");
    lwpass();
}

int fetchannotations(void)
{
    int afirst = 1, i;
    WFDB_Anninfo ai;
    WFDB_Time ta0, taf;

    if (nann < 1) return (0);
    if (tfreq != ffreq) {
	ta0 = (WFDB_Time)(t0*tfreq/ffreq + 0.5);
	taf = (WFDB_Time)(tf*tfreq/ffreq + 0.5);
    }
    else {
	ta0 = t0;
	taf = tf;
    }

    printf("  %c \"annotator\":\n    [", nosig > 0 ? ' ' : '{');  
    setgvmode(WFDB_HIGHRES);
    for (i = 0; i < nann; i++) {
	ai.name = annotator[i];
	ai.stat = WFDB_READ;
	if (annopen(recpath, &ai, 1) >= 0) {
	    char *p;
	    int first = 1;
	    WFDB_Annotation annot;

	    if (ta0 > 0L) iannsettime(ta0);
	    if (!afirst) printf(",");
	    else afirst = 0;
	    printf("\n      { \"name\": \"%s\",\n", annotator[i]);
	    printf("        \"annotation\":\n");
	    printf("        [");
	    while ((getann(0, &annot) == 0) && (taf <= 0 || annot.time < taf)) {
		if (!first) printf(",");
		else first = 0;
		printf("\n          { \"t\": %ld,\n", (long)(annot.time));
		printf("            \"a\": %s,\n",
		       p = strjson(annstr(annot.anntyp)));
		SFREE(p);
		printf("            \"s\": %d,\n", annot.subtyp);
		printf("            \"c\": %d,\n", annot.chan);
		printf("            \"n\": %d,\n", annot.num);
		if (annot.aux && *(annot.aux)) {
		    printf("            \"x\": %s\n", p = strjson(annot.aux+1));
		    SFREE(p);
		}
		else
		    printf("            \"x\": null\n");
		printf("          }");
	    }
	    printf("\n        ]\n      }");	    
	}
    }
    printf("\n    ]\n  }\n");
    return (1);
}

int fetchsignals(void)
{
    int first = 1, framelen, i, imax, imin, j, *m, *mp, n;
    WFDB_Calinfo cal;
    WFDB_Sample **sb, **sp, *sbo, *spo, *v;
    WFDB_Time t, ts0, tsf;

    /* Do nothing if no samples were requested. */ 
    if (nosig < 1 || t0 >= tf) return (0);

    /* Open the signal calibration database. */
    (void)calopen("wfdbcal");

    if (tfreq != ffreq) {
	ts0 = (WFDB_Time)(t0*tfreq/ffreq + 0.5);
	tsf = (WFDB_Time)(tf*tfreq/ffreq + 0.5);
    }
    else {
	ts0 = t0;
	tsf = tf;
    }

    /* Allocate buffers and buffer pointers for each selected signal. */
    SUALLOC(sb, nsig, sizeof(WFDB_Sample *));
    SUALLOC(sp, nsig, sizeof(WFDB_Sample *));
    for (n = framelen = 0; n < nsig; framelen += s[n++].spf)
	if (sigmap[n] >= 0) {
	    SUALLOC(sb[n], (int)((tf-t0)*s[n].spf + 0.5), sizeof(WFDB_Sample));
	    sp[n] = sb[n];
	}
    /* Allocate a frame buffer and construct the frame map. */
    SUALLOC(v, framelen, sizeof(WFDB_Sample));  /* frame buffer */
    SUALLOC(m, framelen, sizeof(int));	    /* frame map */
    for (i = n = 0; n < nsig; n++) {
	for (j = 0; j < s[n].spf; j++)
	    m[i++] = sigmap[n];
    }
    for (imax = framelen-1; imax > 0 && m[imax] < 0; imax--)
	;
    for (imin = 0; imin < imax && m[imin] < 0; imin++)
	;

    /* Fill the buffers. */
    isigsettime(t0);
    for (t = t0; t < tf && getframe(v) > 0; t++)
	for (i = imin, mp = m + imin; i <= imax; i++, mp++)
	    if ((n = *mp) >= 0) *(sp[n]++) = v[i];

    /* Generate output. */
    printf("  { \"signal\":\n    [\n");  
    for (n = 0; n < nsig; n++) {
	if (sigmap[n] >= 0) {
	    char *p;
	    int delta, prev; 

 	    if (!first) printf(",\n");
	    else first = 0;
	    printf("      { \"name\": %s,\n", p = strjson(sname[n])); SFREE(p);
	    if (s[n].units) {
		printf("        \"units\": %s,\n", p = strjson(s[n].units));
		SFREE(p);
	    }
	    else
		printf("        \"units\": \"mV\",\n");
	    printf("        \"t0\": %ld,\n", (long)ts0);
	    printf("        \"tf\": %ld,\n", (long)tsf);
	    printf("        \"gain\": %g,\n",
		   s[n].gain ? s[n].gain : WFDB_DEFGAIN);
	    printf("        \"base\": %d,\n", s[n].baseline);
	    printf("        \"tps\": %d,\n", (int)(tfreq/(ffreq*s[n].spf)+0.5));
	    if (getcal(sname[n], s[n].units, &cal) == 0)
		printf("        \"scale\": %g,\n", cal.scale);
	    else
		printf("        \"scale\": 1,\n");
	    printf("        \"samp\": [ ");
	    for (sbo = sb[n], prev = 0, spo = sp[n]-1; sbo < spo; sbo++) {
		delta = *sbo - prev;
		printf("%d,", delta);
		prev = *sbo;
	    }
	    printf("%d ]\n      }", *sbo - prev);
	}
    }
    printf("\n    ]%s", nann ? ",\n" : "\n  }\n");
    flushcal();
    for (n = 0; n < nsig; n++)
	SFREE(sb[n]);
    SFREE(sb);
    SFREE(sp);
    SFREE(v);
    SFREE(m);
    return (1);	/* output was written */
}

void fetch(void)
{
    prep_signals();
    if (nsig > 0) map_signals();
    prep_annotators();
    prep_times();
    printf("{ \"fetch\":\n");
    if ((fetchsignals() + fetchannotations()) == 0) printf("null");
    printf("}\n");
}

/* force_unique_signames() tries to ensure that each signal has a unique name.
   By default, the name of signal i is s[i].desc.  The names of any signals
   that are not unique are modified by appending a unique suffix to each
   such signal.  For example, if there are five signals with default names
        A, A, B, C, B
   they are renamed as
        A:1*, A:2*, B:3*, C, B:4*

   For efficiency, this function makes two assumptions that may cause it
   to fail to achieve its intended purpose in rare cases.  First, the unique
   suffix is limited to five characters, so that at most 999 signals can be
   renamed.  Second, if any default name ends with a string that matches a
   unique suffix, it will not be recognized as non-unique.  For example, if
   the default names are
       A, A, A:0*
   they are renamed as
       A:0*, A:1*, A:0*
   The format of the suffix has been chosen to make this unlikely.
 */
void force_unique_signames(void) {
    int i, j;

    SALLOC(sname, sizeof(char *), nsig);

    for (i = 0; i < nsig; i++) {
	for (j = i+1; j < nsig; j++) {
	    if (strcmp(s[i].desc, s[j].desc) == 0) {
		sname[i] = sname[j] = "change";
	    }
	}
    }

    for (i = j =  0; i < nsig; i++) {
	if (sname[i] == NULL && j < 1000) {
	    SSTRCPY(sname[i], s[i].desc);
	}
	else {
	    SUALLOC(sname[i], sizeof(char), strlen(s[i].desc) + 6);
	    sprintf(sname[i], "%s:%d*", s[i].desc, j++);
	}
    }	
}

/* ufindsig() is based on findsig() from the WFDB library, but it uses the
   unique signal names assigned by force_unique_signames() rather than
   the default signal names.
*/
int ufindsig(char *p) {
  char *q = p;
  int i;

  while ('0' <= *q && *q <= '9')
      q++;
  if (*q == 0) {	/* all digits, probably a signal number */
      i = atoi(p);
      if (i < nsig) return (i);
  }
  /* Otherwise, p is either an integer too large to be a signal number or a
     string containing a non-digit character.  Assume it's a signal name. */
  for (i = 0; i < nsig; i++)
      if (strcmp(p, sname[i]) == 0) return (i);

  /* No match found. */
  return (-1);    
}

void cleanup(void)
{
    /* Close open files and release allocated memory. */
    wfdbquit();

    SFREE(recpath);
    while (--nann >= 0)
	SFREE(annotator[nann]);

    if (nsig > 0) {
	SFREE(s);
	SFREE(sigmap);
    }
    if (sname) {
	while (--nsig >= 0)
	    SFREE(sname[nsig]);
	SFREE(sname);
    }
}
