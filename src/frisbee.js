
//     frisbee
//     Copyright (c) 2015- Nick Baugh <niftylettuce@gmail.com>
//     MIT Licensed

// * Author: [@niftylettuce](https://twitter.com/#!/niftylettuce)
// * Source: <https://github.com/niftylettuce/frisbee>

// # frisbee

import caseless from 'caseless';
import qs from 'qs';
import { Buffer } from 'buffer';

const fetch = typeof window === 'object' ? window.fetch : global.fetch;

if (!fetch)
  throw new Error(
      'A global `fetch` method is required as either `window.fetch` '
    + 'for browsers or `global.fetch` for node runtime environments. '
    + 'Please add `require(\'isomorphic-fetch\')` before importing `frisbee`. '
    + 'You may optionally `require(\'es6-promise\').polyfill()` before you '
    + 'require `isomorphic-fetch` if you want to support older browsers.'
    + '\n\nFor more info: https://github.com/niftylettuce/frisbee#usage'
  );

const methods = [
  'get',
  'head',
  'post',
  'put',
  'del',
  'options',
  'patch'
];

export default class Frisbee {

  constructor(opts) {

    this.opts = opts || {};

    if (!this.opts.baseURI)
      throw new Error('baseURI option is required');

    this.parseErr = new Error(`Invalid JSON received from ${opts.baseURI}`);

    this.headers = {
      ...opts.headers
    };

    if (this.opts.auth)
      this.auth(this.opts.auth);

    methods.forEach(method => {
      this[method] = this._setup(method);
    });

  }

  _setup(method) {

    return (path = '/', options = {}) => {

      // path must be string
      if (typeof path !== 'string')
        throw new Error('`path` must be a string');

      // otherwise check if its an object
      if (typeof options !== 'object' || Array.isArray(options))
        throw new Error('`options` must be an object');

      const opts = {
        headers: {
          ...this.headers
        },
        ...options,
        method: method === 'del' ? 'DELETE' : method.toUpperCase()
      };

      const c = caseless(opts.headers);

      // in order to support Android POST requests
      // we must allow an empty body to be sent
      // https://github.com/facebook/react-native/issues/4890
      if (typeof opts.body === 'undefined') {
        if (opts.method === 'POST')
          opts.body = '';
      } else if (typeof opts.body === 'object' || opts.body instanceof Array) {
        if (opts.method === 'GET') {
          path += `?${qs.stringify(opts.body)}`;
          delete opts.body;
        } else if (c.get('Content-Type') === 'application/json') {
          try {
            opts.body = JSON.stringify(opts.body);
          } catch (err) {
            throw err;
          }
        }
      }

      return new Promise(async (resolve, reject) => {

        try {

          const res = await fetch(this.opts.baseURI + path, opts);

          if (!res.ok) {

            res.err = new Error(res.statusText);

            // check if the response was JSON, and if so, better the error
            if (res.headers.get('Content-Type').indexOf('application/json') !== -1) {

              try {

                // attempt to parse json body to use as error message
                res.body = await res.text();
                res.body = JSON.parse(res.body);

                // attempt to use Glazed error messages
                if (typeof res.body === 'object'
                  && typeof res.body.message === 'string') {
                  res.err = new Error(res.body.message);
                } else if (!(res.body instanceof Array)
                  // attempt to utilize Stripe-inspired error messages
                  && typeof res.body.error === 'object') {
                  if (res.body.error.message)
                    res.err = new Error(res.body.error.message);
                  if (res.body.error.stack)
                    res.err.stack = res.body.error.stack;
                  if (res.body.error.code)
                    res.err.code = res.body.error.code;
                  if (res.body.error.param)
                    res.err.param = res.body.error.param;
                }

              } catch (e) {
                res.err = this.parseErr;
              }

            }

            resolve(res);
            return;

          }

          // determine whether we're returning text or json for body
          if (res.headers.get('Content-Type').indexOf('application/json') !== -1) {
            try {
              res.body = await res.text();
              res.body = JSON.parse(res.body);
            } catch (err) {
              if (res.headers.get('Content-Type') === 'application/json') {
                res.err = this.parseErr;
                resolve(res);
                return;
              }
            }
          } else {
            res.body = await res.text();
          }

          resolve(res);

        } catch (err) {
          reject(err);
        }

      });

    };

  }

  auth(creds) {

    if (typeof creds === 'string') {
      const index = creds.indexOf(':');
      if (index !== -1) {
        creds = [
          creds.substr(0, index),
          creds.substr(index + 1)
        ];
      }
    }

    if (!Array.isArray(creds))
      creds = [].slice.call(arguments);

    switch (creds.length) {
      case 0:
        creds = ['', ''];
        break;
      case 1:
        creds.push('');
        break;
      case 2:
        break;
      default:
        throw new Error('auth option can only have two keys `[user, pass]`');
    }

    if (typeof creds[0] !== 'string')
      throw new Error('auth option `user` must be a string');

    if (typeof creds[1] !== 'string')
      throw new Error('auth option `pass` must be a string');

    if (!creds[0] && !creds[1])
      delete this.headers.Authorization;
    else
      this.headers.Authorization =
        `Basic ${new Buffer(creds.join(':')).toString('base64')}`;

    return this;

  }

  jwt(token) {

    if (typeof token === 'string')
      this.headers.Authorization =
        `Bearer ${token}`;
    else
      throw new Error('jwt token must be a string');

    return this;

  }

}
