import * as angular from 'angular';
import { StateDeclaration } from '@uirouter/core';
import { resolvedError, obj, decorateExceptionHandler } from './util/testUtilsNg1';
import './util/matchers';

import '../src/legacy/stateEvents';

declare var inject;

const module = angular['mock'].module;

describe('UI-Router v0.2.x $state events', function() {
  let $injector, stateProvider;

  beforeEach(
    module('ui.router.state.events', function($stateEventsProvider, $exceptionHandlerProvider) {
      $stateEventsProvider.enable();
      decorateExceptionHandler($exceptionHandlerProvider);
    }),
  );

  let log, logEvents, logEnterExit;
  function eventLogger(event, to, toParams, from, fromParams) {
    if (logEvents && angular.isFunction(to.to)) {
      const transition = to;
      log += event.name + '(' + transition.to().name + ',' + transition.from().name + ');';
    } else if (logEvents) {
      log +=
        event.name +
        '(' +
        (angular.isString(to.name) ? to.name : to) +
        ',' +
        (angular.isString(from.name) ? from.name : from) +
        ');';
    }
  }
  function callbackLogger(what) {
    return function() {
      if (logEnterExit) log += this.name + '.' + what + ';';
    };
  }

  const A: StateDeclaration = { data: {} },
    B: StateDeclaration = {},
    C: StateDeclaration = {},
    D: StateDeclaration = { params: { x: {}, y: {} } },
    DD: StateDeclaration = { parent: D, params: { z: {} } },
    E: StateDeclaration = { params: { i: {} } },
    F: StateDeclaration = {
      resolve: {
        delay: function($timeout) {
          return $timeout(angular.noop, 50);
        },
      },
    };

  beforeEach(
    module(function($stateProvider, $provide) {
      angular.forEach([A, B, C, D, DD], function(state) {
        state.onEnter = callbackLogger('onEnter');
        state.onExit = callbackLogger('onExit');
      });
      stateProvider = $stateProvider;

      $stateProvider
        .state('A', A)
        .state('B', B)
        .state('C', C)
        .state('D', D)
        .state('DD', DD)
        .state('E', E)
        .state('F', F);
    }),
  );

  beforeEach(
    inject(function($rootScope, _$injector_) {
      $injector = _$injector_;
      log = '';
      logEvents = logEnterExit = false;
      $rootScope.$on('$stateChangeStart', eventLogger);
      $rootScope.$on('$stateChangeSuccess', eventLogger);
      $rootScope.$on('$stateChangeError', eventLogger);
      $rootScope.$on('$stateNotFound', eventLogger);
    }),
  );

  function $get(what) {
    return $injector.get(what);
  }

  function initStateTo(state, optionalParams?, optionalOptions?) {
    const $state = $get('$state'),
      $q = $get('$q');
    $state.transitionTo(state, optionalParams || {}, optionalOptions || {});
    $q.flush();
    expect($state.current).toBe(state);
  }

  describe('.transitionTo()', function() {
    it(
      'triggers $stateChangeStart',
      inject(function($state, $q, $rootScope) {
        initStateTo(E, { i: 'iii' }, { anOption: true });
        let called;
        $rootScope.$on('$stateChangeStart', function(ev, to, toParams, from, fromParams, options) {
          expect(from).toBe(E);

          expect(obj(fromParams)).toEqual({ i: 'iii' });

          expect(to).toBe(D);

          expect(obj(toParams)).toEqual({ x: '1', y: '2' });

          expect(options.custom.anOption).toBe(false);

          expect($state.current).toBe(from); // $state not updated yet
          expect(obj($state.params)).toEqual(obj(fromParams));
          called = true;
        });
        $state.transitionTo(D, { x: '1', y: '2' }, { custom: { anOption: false } });
        $q.flush();
        expect(called).toBeTruthy();
        expect($state.current).toBe(D);
      }),
    );

    it(
      'can be cancelled by preventDefault() in $stateChangeStart',
      inject(function($state, $q, $rootScope) {
        $state.defaultErrorHandler(function() {});
        initStateTo(A);
        let called;
        $rootScope.$on('$stateChangeStart', function(ev) {
          ev.preventDefault();
          called = true;
        });
        const promise = $state.transitionTo(B, {});
        $q.flush();
        expect(called).toBeTruthy();
        expect($state.current).toBe(A);
        expect(resolvedError(promise)).toBeTruthy();
      }),
    );

    it(
      'triggers $stateNotFound',
      inject(function($state, $q, $rootScope) {
        initStateTo(E, { i: 'iii' });
        let called;
        $rootScope.$on('$stateNotFound', function(ev, unfoundState, fromState, fromParams) {
          expect(fromState).toBe(E);
          expect(obj(fromParams)).toEqual({ i: 'iii' });
          expect(unfoundState.to).toEqual('never_defined');
          expect(unfoundState.toParams).toEqual({ x: '1', y: '2' });

          expect($state.current).toBe(E); // $state not updated yet
          expect(obj($state.params)).toEqual({ i: 'iii' });
          called = true;
        });
        let message;
        $state.transitionTo('never_defined', { x: '1', y: '2' }).catch(function(e) {
          message = e.detail;
        });
        $q.flush();
        expect(message).toEqual("No such state 'never_defined'");
        expect(called).toBeTruthy();
        expect($state.current).toBe(E);
      }),
    );

    it(
      'throws Error on failed relative state resolution',
      inject(function($state, $q) {
        $state.transitionTo(DD);
        $q.flush();
        let error,
          promise = $state.transitionTo('^.Z', null, { relative: $state.$current });
        promise.catch(function(e) {
          error = e.detail;
        });
        $q.flush();

        const err = "Could not resolve '^.Z' from state 'DD'";
        expect(error).toBe(err);
      }),
    );

    it(
      'sends $stateChangeError for exceptions in onEnter',
      inject(function($state, $q, $rootScope, $exceptionHandler) {
        $exceptionHandler.disabled = true;
        $state.defaultErrorHandler(function() {});

        stateProvider.state('onEnterFail', {
          onEnter: function() {
            throw new Error('negative onEnter');
          },
        });

        let called;
        $rootScope.$on('$stateChangeError', function(ev, to, toParams, from, fromParams, options) {
          called = true;
        });

        initStateTo(A);
        $state.transitionTo('onEnterFail');
        $q.flush();

        expect(called).toBeTruthy();
        expect($state.current.name).toEqual(A.name);
      }),
    );

    it(
      'can be cancelled by preventDefault() in $stateNotFound',
      inject(function($state, $q, $rootScope) {
        initStateTo(A);
        let called;
        $rootScope.$on('$stateNotFound', function(ev) {
          ev.preventDefault();
          called = true;
        });
        const promise = $state.transitionTo('never_defined', {});
        $q.flush();
        expect(called).toBeTruthy();
        expect($state.current).toBe(A);
        expect(resolvedError(promise)).toBeTruthy();
      }),
    );

    it(
      'can be redirected in $stateNotFound',
      inject(function($state, $q, $rootScope) {
        initStateTo(A);
        let called;
        $rootScope.$on('$stateNotFound', function(ev, redirect) {
          redirect.to = D;
          redirect.toParams = { x: '1', y: '2' };
          called = true;
        });
        const promise = $state.transitionTo('never_defined', { z: 3 });
        $q.flush();
        expect(called).toBeTruthy();
        expect($state.current).toBe(D);
        expect(obj($state.params)).toEqual({ x: '1', y: '2' });
      }),
    );

    it(
      'can lazy-define a state in $stateNotFound',
      inject(function($state, $q, $rootScope) {
        initStateTo(DD, { x: 1, y: 2, z: 3 });
        let called;
        $rootScope.$on('$stateNotFound', function(ev, redirect) {
          stateProvider.state(redirect.to, { parent: DD, params: { w: {} } });
          ev.retry = called = true;
        });
        const promise = $state.go('DDD', { w: 4 });
        $q.flush();
        expect(called).toBeTruthy();
        expect($state.current.name).toEqual('DDD');
        expect(obj($state.params)).toEqual({ x: 1, y: 2, z: 3, w: 4 });
      }),
    );

    it(
      'can defer a state transition in $stateNotFound',
      inject(function($state, $q, $rootScope) {
        initStateTo(A);
        let called;
        const deferred = $q.defer();
        $rootScope.$on('$stateNotFound', function(ev, redirect) {
          ev.retry = deferred.promise;
          called = true;
        });
        const promise = $state.go('AA', { a: 1 });
        stateProvider.state('AA', { parent: A, params: { a: {} } });
        deferred.resolve();
        $q.flush();
        expect(called).toBeTruthy();
        expect($state.current.name).toEqual('AA');
        expect(obj($state.params)).toEqual({ a: 1 });
      }),
    );

    it(
      'can defer and supersede a state transition in $stateNotFound',
      inject(function($state, $q, $rootScope) {
        initStateTo(A);
        let called;
        const deferred = $q.defer();
        $rootScope.$on('$stateNotFound', function(ev, redirect) {
          ev.retry = deferred.promise;
          called = true;
        });
        const promise = $state.go('AA', { a: 1 });
        $state.go(B);
        stateProvider.state('AA', { parent: A, params: { a: {} } });
        deferred.resolve();
        $q.flush();
        expect(called).toBeTruthy();
        expect($state.current).toEqual(B);
        expect(obj($state.params)).toEqual({});
      }),
    );

    it(
      'triggers $stateChangeSuccess',
      inject(function($state, $q, $rootScope) {
        initStateTo(E, { i: 'iii' });
        let called;
        $rootScope.$on('$stateChangeSuccess', function(ev, to, toParams, from, fromParams) {
          expect(from).toBe(E);
          expect(obj(fromParams)).toEqual({ i: 'iii' });
          expect(to).toBe(D);
          expect(obj(toParams)).toEqual({ x: '1', y: '2' });

          expect($state.current).toBe(to); // $state has been updated
          expect(obj($state.params)).toEqual(obj(toParams));
          called = true;
        });
        $state.transitionTo(D, { x: '1', y: '2' });
        $q.flush();
        expect(called).toBeTruthy();
        expect($state.current).toBe(D);
      }),
    );

    it(
      'does not trigger $stateChangeSuccess when suppressed, but changes state',
      inject(function($state, $q, $rootScope) {
        initStateTo(E, { i: 'iii' });
        let called;

        $rootScope.$on('$stateChangeSuccess', function(ev, to, toParams, from, fromParams) {
          called = true;
        });

        $state.transitionTo(D, { x: '1', y: '2' }, { notify: false });
        $q.flush();

        expect(called).toBeFalsy();
        expect($state.current).toBe(D);
      }),
    );

    it(
      'does not trigger $stateChangeSuccess when suppressed, but updates params',
      inject(function($state, $q, $rootScope) {
        initStateTo(E, { x: 'iii' });
        let called;

        $rootScope.$on('$stateChangeSuccess', function(ev, transition) {
          called = true;
        });
        $state.transitionTo(E, { i: '1', y: '2' }, { notify: false });
        $q.flush();

        expect(called).toBeFalsy();
        expect($state.params.i).toBe('1');
        expect($state.current).toBe(E);
      }),
    );

    it(
      'aborts pending transitions even when going back to the current state',
      inject(function($state, $q, $timeout) {
        initStateTo(A);
        logEvents = true;
        $state.defaultErrorHandler(function() {});

        const superseded = $state.transitionTo(F, {});
        $q.flush();
        expect($state.current).toBe(A);

        $state.transitionTo(A, {});
        $q.flush();
        $timeout.flush();
        expect($state.current).toBe(A);
        expect(resolvedError(superseded)).toBeTruthy();
        expect(log).toBe('$stateChangeStart(F,A);');
      }),
    );

    it(
      'aborts pending transitions (last call wins)',
      inject(function($state, $q, $timeout) {
        initStateTo(A);
        logEvents = true;
        $state.defaultErrorHandler(function() {});

        const superseded = $state.transitionTo(F, {});
        $q.flush();

        $state.transitionTo(C, {});
        $q.flush();
        $timeout.flush();
        expect($state.current).toBe(C);
        expect(resolvedError(superseded)).toBeTruthy();
        expect(log).toBe('$stateChangeStart(F,A);' + '$stateChangeStart(C,A);' + '$stateChangeSuccess(C,A);');
      }),
    );
  });
});
