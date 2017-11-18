'use strict';

function Scope() {
    this.$$watchers = [];
    this.$$asynQueue = [];
    this.$$applyAsynQueue = [];
    this.$$lastDirtyWatch = null;
    this.$$phase = null;
    this.$$applyAsyncId = null;
}

function initWatchVal() {}

Scope.prototype.$watch = function (watchFn, listenerFn, valueEq) {
    var watcher = {
        watchFn: watchFn,
        listenerFn: listenerFn || function () {},
        last: initWatchVal,
        valueEq: !!valueEq
    };
    this.$$watchers.push(watcher);
    this.$$lastDirtyWatch = null;
};

Scope.prototype.$digest = function () {
    var dirty;
    var ttl = 10;
    this.$$lastDirtyWatch = null;
    this.$beginPhase('$digest');
    if (this.$$applyAsyncId === null && this.$$applyAsynQueue.length) {
        clearTimeout(this.$$applyAsyncId);
        this.$$flashApplyAsync();
        this.$$applyAsyncId = null;
    }
    do {
        while (this.$$asynQueue.length) {
            var asyncTask = this.$$asynQueue.shift();
            asyncTask.scope.$eval(asyncTask.expression);
        }
        dirty = this.$$digestOnce();
        if ((dirty || this.$$asynQueue.length) && !ttl--) {//如果在watchFn中添加任务，这里需要做一个限制，保证超过了ttl就退出
            this.$clearPhase();
            throw ('10 digest iterations reached');
        }
    } while (dirty || this.$$asynQueue.length);//前一轮还是有不同的生活或者还有需要执行任务的情况下，继续下一次轮询
    this.$clearPhase();
};

Scope.prototype.$$digestOnce = function () {
    var self = this;
    var newValue, oldValue, dirty;
    _.forEach(self.$$watchers, function (watcher) {
        newValue = watcher.listenerFn(self);
        oldValue = watcher.last;
        if (self.areEqual(newValue, oldValue, watcher.valueEq)) {
            watcher.listenerFn(newValue, oldValue === initWatchVal ? newValue : oldValue, self);
            watcher.last = watcher.valueEq ? _.cloneDeep(newValue) : newValue;
            self.$$lastDirtyWatch = watcher;
            dirty = true;
        } else if (self.$$lastDirtyWatch === watcher) {
            return false;
        }
    });
    return dirty;
};

Scope.prototype.areEqual = function (newValue, oldValue, valueEq) {
    if (valueEq) {
        return _.isEqual(newValue, oldValue);
    } else {
        //NAN
        return newValue === oldValue || (newValue !== newValue && oldValue !== oldValue);
    }
};

Scope.prototype.$eval = function (expr, locals) {
    return expr(this, locals);
};

Scope.prototype.$apply = function (expr) {
    this.$beginPhase('$apply');
    try {
        return this.$eval(expr);
    } finally {
        this.$clearPhase();
        this.$digest();
    }
};

Scope.prototype.$evalAsync = function (expr) {
    var self = this;
    //如果没有在在$digest中，触发它
    //但是多次调用会出现多个setTimeout，因此判断一下，如果第一次进入，任务则是空，需要执行定时器，如果是第二次进入，则不需要定时器
    if (!self.$$phase && !self.$$asynQueue.length) {
        setTimeout(function () {
            //如果没有任务，则不需要$digest，保证尽量少执行多余的$digest
            //可能出现调用了$evalAsync后同步执行的代码中已经调用了$digest，那么异步队列则被清空
            if (self.$$asynQueue.length) {
                self.$digest();
            }
        });
    }
    self.$$asynQueue.push({
        scope: this,
        expression: expr
    });
};

Scope.prototype.$applyAsync = function (expr) {
    var self = this;
    //需要一个队列来缓存代码
    self.$$applyAsynQueue.push(expr);
    //标识是否有定时器
    self.$$applyAsyncId = setTimeout(function () {
        self.$apply(function () {
            self.$$flashApplyAsync();
        });
        self.$$applyAsyncId = null;
    });
};

Scope.prototype.$$flashApplyAsync = function () {
    while (this.$$applyAsynQueue.length) {
        this.$eval(this.$$applyAsynQueue.shift());
    }
};

Scope.prototype.$beginPhase = function (phase) {
    if (this.$$phase !== null) {
        throw this.$$phase + ' already in progress';
    }
    this.$$phase = phase;
};

Scope.prototype.$clearPhase = function () {
    this.$$phase = null;
};