# file: Makefile	G. Moody	18 November 2012
#			Last revised:	30 November 2012
# 'make' description file for building and installing LightWAVE  version 0.01
#
# *** It is not necessary to install LightWAVE in order to use it!
# *** Point your browser to http://physionet.org/lightwave/ to do so.
#
# LightWAVE is a lightweight waveform and annotation viewer and editor.
#
# LightWAVE is modelled on WAVE, an X11/XView application I wrote and
# maintained between 1989 and 2012.  LightWAVE runs within any modern
# web browser and does not require installation on the user's computer.
# 
# This file, and the others in this directory, can be used to install
# LightWAVE on your own web server.  You might want to do this if your
# connection to physionet.org is slow or intermittent.
#
# Prerequisites:
#  httpd	 (a properly configured web server, such as Apache)
#  jquery.min.js (from http://jquery.com/download/)
#  libcgi	 (from http://libcgi.sourceforge.net/)
#  libwfdb	 (from http://physionet.org/physiotools/wfdb.shtml)
#  libcurl	 (from http://curl.haxx.se/libcurl/)
#
# To build and install successfully using this Makefile, you will also need
# a few standard POSIX tools including 'gcc' (or another ANSI/ISO compiler)
# and 'make'. 
#
# Install jquery.min.js in JSDIR (see below), and install the three libraries
# where the compiler/linker will find them (on Linux or MacOS X, /usr/lib is
# usually the best choice).  Then return to this directory and type 'make' to
# install all components of LightWAVE.
#
# If your web server is "myserver.com", start LightWAVE by pointing
# your browser to http://myserver.com/lightwave/.

# CC is the default C compiler
CC = gcc

# ROOTDIR is the web server's root directory
ROOTDIR = /home/physionet

# BINDIR is the directory containing CGI applications.  The web
# server may need to be reconfigured if BINDIR is changed.
BINDIR = $(ROOTDIR)/cgi-bin

# HTMLDIR is the directory containing lightwave's HTML and CSS
# files.  It should be within the web server's main html directory.
HTMLDIR = $(ROOTDIR)/html/lightwave

# JSDIR is the directory containing lightwave's JavaScript files.
# Warning: index.shtml must be updated if JSDIR is changed!
JSDIR = $(ROOTDIR)/html/js

# CFLAGS is a set of options for the C compiler.
CFLAGS = -O -DHTMLDIR=\"$(HTMLDIR)\"

# LDFLAGS is a set of options for the linker.
LDFLAGS = -lcgi -lwfdb

# TARGETS is a list of files to be built and installed.
TARGETS = $(BINDIR)/lightwave $(HTMLDIR)/index.shtml $(JSDIR)/lightwave.js

install:	$(TARGETS)

# Build and install the lightwave web application.
$(BINDIR)/lightwave:	lightwave.c
	$(CC) $(CFLAGS) lightwave.c -o $(BINDIR)/lightwave $(LDFLAGS)

# Install the lightwave HTML and CSS files.
$(HTMLDIR)/index.shtml:	lightwave.shtml lightwave.css about.shtml
	mkdir -p $(HTMLDIR)
	cp about.shtml lightwave.css $(HTMLDIR)
	cp lightwave.shtml $(HTMLDIR)/index.shtml

# Install lightwave's Javascript code.
$(JSDIR)/lightwave.js:	 lightwave.js
	cp lightwave.js $(JSDIR)

# 'make clean': Remove unneeded files from this directory.
clean:
	rm -f *~
