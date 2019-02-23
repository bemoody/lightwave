/* file: cgi.h		B. Moody	22 February 2019

Simple functions for parsing CGI environment variables
Copyright (C) 2019 Benjamin Moody

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at
your option) any later version.

This program is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

#ifndef LIGHTWAVE_CGI_H
#define LIGHTWAVE_CGI_H

void cgi_init(void);
void cgi_end(void);
void cgi_process_form(void);
char *cgi_param(const char *name);
char *cgi_param_multiple(const char *name);

#endif
