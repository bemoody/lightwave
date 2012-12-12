/* file: lightwave.c	G. Moody	18 November 2012
			Last revised:	11 December 2012  version 0.06
LightWAVE CGI application
Copyright (C) 2012 George B. Moody

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

This file contains the main server-side code, which uses the WFDB
library (http://physionet.org/physiotools/wfdb.shtml) to handle AJAX
requests from the LightWAVE client.  CGI interaction with the web
server is handled by libcgi (http://libcgi.sourceforge.net/).
_______________________________________________________________________________

*/

#include <stdio.h>
#include <stdlib.h>
#include <libcgi/cgi.h>
#include <wfdb/wfdblib.h>

#ifndef LWDIR
#define LWDIR "/home/physionet/html/lightwave"
#endif

#ifndef BUFSIZE
#define BUFSIZE 1024	/* bytes read at a time */
#endif

#define TOL	0.001	/* tolerance for error in approximate equality */

static char *action, *annotator, buf[BUFSIZE], *db, *record, *recpath;
static int interactive, nsig, nosig, *sigmap;
WFDB_FILE *ifile;
WFDB_Frequency ffreq, tfreq;
WFDB_Sample *v;
WFDB_Siginfo *s;
WFDB_Time t0, tf, dt;

char *get_param(char *name), *get_param_multiple(char *name);
double approx_LCM(double x, double y);
void dblist(void), rlist(void), alist(void), slist(void), info(void),
    fetch(void), retrieve(void), print_file(char *filename);

int main(int argc, char **argv)
{
    int i;

    if (argc < 2) {  /* normal operation as a CGI application */
        cgi_init();
	atexit(cgi_end);
	cgi_process_form();
	cgi_init_headers();
    }
    else
        interactive = 1;  /* interactive mode for debugging */
    wfdbquiet();	  /* suppress WFDB library error messages */

    if (!(action = get_param("action")))
	print_file(LWDIR "/index.shtml");

    else if (strcmp(action, "dblist") == 0) {
	dblist();
	exit(0);
    }

    else if ((db = get_param("db")) == NULL)
        exit(0);	/* early exit if no database chosen */

    else if (strcmp(action, "rlist") == 0) {
	rlist();
	exit(0);
    }

    else if (strcmp(action, "alist") == 0) {
	alist();
	exit(0);
    }

    else if ((record = get_param("record")) == NULL)
        exit(0);	/* early exit if no record chosen */

    else {
      // FIXME: uncomment the next line to work around a WFDB library bug
      //   setwfdb("/usr/local/database");
        SUALLOC(recpath, strlen(db) + strlen(record) + 2, sizeof(char));
        sprintf(recpath, "%s/%s", db, record);

	/* Discover the number of signals defined in the header, allocate
	   memory for their signal information structures, open the signals. */
	if ((nsig = isigopen(recpath, NULL, 0)) > 0) {
	    SUALLOC(s, nsig, sizeof(WFDB_Siginfo));
	    nsig = isigopen(recpath, s, nsig);
	} 

	/* Find the least common multiple of the sampling frequencies (which
	   may not be exactly expressible as floating-point numbers).  In
	   WFDB-compatible records, all signals are sampled at the same
	   frequency or at a multiple of the frame frequency, but (especially
	   in EDF records) there may be many samples of each signal in each
	   frame.  The for loop below sets the "tick" frequency tfreq to the
	   number of instants in each second when at least one sample is
	   acquired. */
	setgvmode(WFDB_LOWRES);
	ffreq = sampfreq(NULL);
	for (i = 0, tfreq = ffreq; i < nsig; i++)
	    tfreq = approx_LCM(ffreq * s[i].spf, tfreq);

	if (strcmp(action, "info") == 0)
	    info();

	else if (strcmp(action, "fetch")==0) {
	    char *p;
	    int n;

	    if (nsig > 0) {
		SUALLOC(sigmap, nsig, sizeof(int));
		for (n = 0; n < nsig; n++)
		    sigmap[n] = -1;
		while (p = get_param_multiple("signal"))
		    if (0 <= (n = atoi(p)) && n < nsig) {
			sigmap[n] = n; n++; nosig++;
		    }
	    }
	    annotator = get_param("annotator");
	    if ((p = get_param("t0")) == NULL) p = "0";
	    if ((t0 = strtim(p)) < 0L) t0 = -t0;
	    if ((p = get_param("dt")) == NULL) p = "1";
	    if ((dt = atoi(p) * ffreq) < 1) dt = 1;
	    tf = t0 + dt;

	    fetch();

	    if (nsig > 0) {
		SFREE(sigmap);
		SFREE(v);
	    }
	}
    }

    /* Close open files and release allocated memory. */
    wfdbquit();
    if (nsig > 0) SFREE(s);
    SFREE(recpath);

    exit(0);
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

void dblist(void)
{
    if (ifile = wfdb_open("DBS", NULL, WFDB_READ)) {
        int first = 1;
        printf("{ \"database\": [\n");
	while (wfdb_fgets(buf, sizeof(buf), ifile)) {
	    char *p;

	    for (p = buf; p < buf + sizeof(buf) && *p != '\t'; p++)
		;
	    if (*p != '\t') continue;
	    *p++ = '\0';
	    while (p < buf + sizeof(buf) - 1 && *p == '\t')
		p++;
	    p[strlen(p)-1] = '\0';
	    if (!first) printf(",\n");
	    else first = 0;
	    printf("    { \"name\": \"%s\",\n      \"desc\": \"%s\"\n    }",
		   buf, p);
	}
	printf("\n  ]\n}\n");
	wfdb_fclose(ifile);
    }
}

void rlist(void)
{
    sprintf(buf, "%s/RECORDS", db);
    if (ifile = wfdb_open(buf, NULL, WFDB_READ)) {
        int first = 1;

        printf("{ \"record\": [\n");
	while (wfdb_fgets(buf, sizeof(buf), ifile)) {
	    buf[strlen(buf)-1] = '\0';
	    if (!first) printf(",\n");
	    else first = 0;
	    printf("    \"%s\"", buf);
	}
	printf("\n  ]\n}\n");
	wfdb_fclose(ifile);
    }
}

void alist(void)
{
    sprintf(buf, "%s/ANNOTATORS", db);
    if (ifile = wfdb_open(buf, NULL, WFDB_READ)) {
        int first = 1;
        printf("{ \"annotator\": [\n");
	while (wfdb_fgets(buf, sizeof(buf), ifile)) {
	    char *p;

	    for (p = buf; p < buf + sizeof(buf) && *p != '\t'; p++)
		;
	    if (*p != '\t') continue;
	    *p++ = '\0';
	    while (p < buf + sizeof(buf) - 1 && *p == '\t')
		p++;
	    p[strlen(p)-1] = '\0';
	    if (!first) printf(",\n");
	    else first = 0;
	    printf("    { \"name\": \"%s\",\n      \"desc\": \"%s\"\n    }",
		   buf, p);
	}
	printf("\n  ]\n}\n");
	wfdb_fclose(ifile);
    }
}

void info(void)
{
    char *p;
    int i;

    printf("{ \"info\":\n");
    printf("  { \"db\": \"%s\",\n", db);
    printf("    \"record\": \"%s\",\n", record);
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
    p = mstimstr(strtim("e"));
    while (*p == ' ') p++;
    printf("    \"duration\": \"%s\"", p);
    if (nsig > 0) printf(",\n    \"signal\": [\n", record);
    for (i = 0; i < nsig; i++) {
        printf("      { \"desc\": \"%s\",\n", s[i].desc);
	printf("        \"tps\": %g,\n", tfreq/(ffreq*s[i].spf));
	if (s[i].units)
	    printf("        \"units\": \"%s\",\n", s[i].units);
	else
	    printf("        \"units\": null,\n");
	printf("        \"gain\": %g,\n", s[i].gain);
	printf("        \"adcres\": %d,\n", s[i].adcres);
	printf("        \"adczero\": %d,\n", s[i].adczero);
	printf("        \"baseline\": %d\n", s[i].baseline);
	printf("      }%s", i < nsig-1 ? ",\n" : "\n    ]");
    }
    printf("\n  }\n}\n");
}

void fetchannotations(void)
{
    WFDB_Anninfo ai;

    ai.name = annotator;
    ai.stat = WFDB_READ;
    if (annopen(recpath, &ai, 1) >= 0) {
	int first = 1;
	WFDB_Annotation annot;

	iannsettime(t0);
	printf("\"annotation\": [\n");
	while (getann(0, &annot) == 0 && annot.time < tf) {
	    if (!first) printf(",\n");
	    else first = 0;
	    printf("    { \"t\": \%ld,\n", annot.time);
	    printf("      \"a\": \"%s\",\n", annstr(annot.anntyp));
	    printf("      \"s\": %d,\n", annot.subtyp);
	    printf("      \"c\": %d,\n", annot.chan);
	    printf("      \"n\": %d,\n", annot.num);
	    if (annot.aux) {
		char *p = annot.aux + 1, *e = annot.aux + (*annot.aux);

		printf("      \"x\": \"");
		for ( ; p < e && isprint(*p); p++) {
		    if (*p == '\"') printf("\\\"");
		    else printf("%c", *p);
		}
		printf("\"");
	    }
	    else
		printf("      \"x\": null");
	    printf("\n    }");
	}
	printf("\n  ]\n");	    
    }
}

void fetchsignals(void)
{
    int first = 1, framelen, i, imax, imin, j, *m, *mp, n;
    WFDB_Sample **sb, **sp, *sbo, *spo, *v;
    WFDB_Time t;

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
    printf("\"signal\": [\n");  
    for (n = 0; n < nsig; n++) {
	if (sigmap[n] >= 0) {
	    int delta, prev; 
 	    if (!first) printf(",\n");
	    else first = 0;
	    printf("    { \"name\": \"%s\",\n", s[n].desc);
	    printf("      \"units\": \"%s\",\n",
		   s[n].units ? s[n].units : "mV [assumed]");
	    printf("      \"t0\": %ld,\n", (long)t0);
	    printf("      \"tf\": %ld,\n", (long)tf);
	    printf("      \"gain\": %g,\n", s[n].gain);
	    printf("      \"base\": %d,\n", s[n].baseline);
	    printf("      \"tps\": %d,\n", (int)(tfreq/(ffreq*s[n].spf) + 0.5));
	    printf("      \"samp\": [ ");
	    for (sbo = sb[n], prev = 0, spo = sp[n]-1; sbo < spo; sbo++) {
		delta = *sbo - prev;
		printf("%d,", delta);
		prev = *sbo;
	    }
	    printf("%d ] }", *sbo - prev);
	}
    }
    printf("\n    ]\n");
}

void fetch(void)
{
    printf("{ \"fetch\": {\n");
    if (annotator) {
	fetchannotations();
	if (nosig) printf(",\n");
    }
    if (nosig) fetchsignals();
    printf("  }\n}\n");
}
