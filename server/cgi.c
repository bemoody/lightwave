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

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include "cgi.h"

static struct {
    char *name;
    char **values;
    size_t n_values;
    size_t scan_index;
} *query_params;

static size_t n_query_params;

#define XALLOC0(arr, n) do {                            \
        void *p_ = calloc((n), sizeof((arr)[0]));       \
        assert(p_ != NULL);                             \
        (arr) = p_;                                     \
    } while (0)

#define XREALLOC(arr, n) do {                              \
        void *p_ = (arr);                                  \
        size_t n_ = (n);                                   \
        size_t m_ = sizeof((arr)[0]);                      \
        assert(n_ <= ((size_t) -1 / m_));                  \
        p_ = realloc(p_, n_ * m_);                         \
        assert(p_ != NULL);                                \
        (arr) = p_;                                        \
    } while (0)

void cgi_init(void)
{
}

void cgi_end(void)
{
}

static int xdigitvalue(char c)
{
    if (c >= '0' && c <= '9')
        return c - '0';
    if (c >= 'A' && c <= 'F')
        return c - 'A' + 0xa;
    if (c >= 'a' && c <= 'f')
        return c - 'a' + 0xa;
    return -1;
}

static char *url_decode(const char *str, size_t len)
{
    char *s;
    size_t i, j, dlen;

    for (i = dlen = 0; i < len; i++) {
        if (str[i] == '%' && i + 2 < len
            && xdigitvalue(str[i + 1]) >= 0
            && xdigitvalue(str[i + 2]) >= 0)
            i += 2;
        dlen++;
    }
    XALLOC0(s, dlen + 1);

    for (i = j = 0; i < len; i++) {
        if (str[i] == '%' && i + 2 < len
            && xdigitvalue(str[i + 1]) >= 0
            && xdigitvalue(str[i + 2]) >= 0) {
            s[j] = (xdigitvalue(str[i + 1]) << 4
                    | xdigitvalue(str[i + 2]));
            i += 2;
        }
        else if (str[i] == '+')
            s[j] = ' ';
        else
            s[j] = str[i];
        j++;
    }
    assert(j == dlen);
    s[j] = 0;
    return s;
}

static void parse_param(const char *str, size_t len)
{
    const char *val;
    size_t nlen, vlen, i, n;
    char *nstr, *vstr;

    val = memchr(str, '=', len);
    if (val) {
        assert(val >= str && val < str + len);
        nlen = val - str;
        val++;
        vlen = len - nlen - 1;
    }
    else {
        nlen = len;
        val = "";
        vlen = 0;
    }

    nstr = url_decode(str, nlen);
    vstr = url_decode(val, vlen);

    for (i = 0; i < n_query_params; i++) {
        if (!strcmp(query_params[i].name, nstr)) {
            n = query_params[i].n_values;
            XREALLOC(query_params[i].values, n + 1);
            query_params[i].values[n] = vstr;
            query_params[i].n_values++;
            free(nstr);
            return;
        }
    }

    i = n_query_params;
    XREALLOC(query_params, i + 1);
    query_params[i].name = nstr;
    XALLOC0(query_params[i].values, 1);
    query_params[i].values[0] = vstr;
    query_params[i].n_values = 1;
    query_params[i].scan_index = 0;
    n_query_params++;
}

void cgi_process_form(void)
{
    const char *qstr;
    size_t len;

    query_params = NULL;
    n_query_params = 0;

    qstr = getenv("QUERY_STRING");
    if (!qstr)
        return;

    while (*qstr) {
        len = strcspn(qstr, ";&");
        if (len > 0)
            parse_param(qstr, len);
        qstr += len;
        if (*qstr)
            qstr++;
        else
            break;
    }
}

char *cgi_param(const char *name)
{
    size_t i;
    for (i = 0; i < n_query_params; i++)
        if (query_params && query_params[i].name
            && !strcmp(name, query_params[i].name)
            && query_params[i].values)
            return query_params[i].values[0];
    return NULL;
}

char *cgi_param_multiple(const char *name)
{
    size_t i;

    for (i = 0; i < n_query_params; i++) {
        if (query_params && query_params[i].name
            && !strcmp(name, query_params[i].name)
            && query_params[i].values) {
            if (query_params[i].scan_index < query_params[i].n_values) {
                query_params[i].scan_index++;
                return query_params[i].values[query_params[i].scan_index - 1];
            }
            else {
                query_params[i].scan_index = 0;
                return NULL;
            }
        }
    }

    return NULL;
}
