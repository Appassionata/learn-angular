'use strict';

function Scope() {
    this.$$watchers = [];
    this.$$asynQueue = [];
    this.$$applyAsynQueue = [];
    this.$$postDigestQueue = [];
    this.$$children = [];
    this.$$lastDirtyWatch = null;
    this.$$phase = null;
    this.$$applyAsyncId = null;
}

var exceptionHandler = console.error;

function initWatchVal() {}

Scope.prototype.$watch = function (watchFn, listenerFn, valueEq) {
    var watcher = {
        watchFn: watchFn,
        listenerFn: listenerFn || function () {},
        last: initWatchVal,
        valueEq: !!valueEq
    };
    var self = this;
    /*
      * 这里使用unshift，遍历的时候使用forEachRight是为了防止出现在watchFn
      * 或者listener中销毁了watcher（无论是本次的还是其他的）
      *
      * 如果使用push和forEach的情况下，删除本次或本次以前的元素会导致遍历的
      * 下一个元素其实是下下个元素(index+2)，可能会少遍历一个元素，并且最后
      * 肯定会读取array[length]，导致最后一个元素undefined
      *
      * 如果使用unshift和forEachRight
      * 删除了本次或本次后的元素不影响便利，删除了本次前的元素会导致下一次遍历
      * 的还是本次元素因此，如果删除前遍历本次元素dirty，删除后遍历本次元素not
      * dirty，会被短路，因此删除后需要吧$$lastDirtyWatch清除
      *
    */
    self.$$watchers.unshift(watcher);
    //如果在listener中再次加入watcher，下一次遍历会被短路，因此需要重置$$lastDirtyWatch
    self.$$lastDirtyWatch = null;
    return function () {
        var index = self.$$watchers.indexOf(watcher);
        if (index > -1) {
            self.$$watchers.splice(index, 1);
            self.$$lastDirtyWatch = null;
        }
    };
};

Scope.prototype.$digest = function () {
    var dirty;
    var ttl = 10;
    this.$$lastDirtyWatch = null;
    this.$beginPhase('$digest');
    if (this.$$applyAsyncId !== null && this.$$applyAsynQueue.length) {
        clearTimeout(this.$$applyAsyncId);
        this.$$flushApplyAsync();
        this.$$applyAsyncId = null;
    }
    do {
        while (this.$$asynQueue.length) {
            try {
                var asyncTask = this.$$asynQueue.shift();
                asyncTask.scope.$eval(asyncTask.expression);
            } catch (e) {
                exceptionHandler(e);
            }
        }
        dirty = this.$$digestOnce();
        if ((dirty || this.$$asynQueue.length) && !ttl--) {//如果在watchFn中添加任务，这里需要做一个限制，保证超过了ttl就退出
            this.$clearPhase();
            throw ttl + ' digest iterations reached';
        }
    } while (dirty || this.$$asynQueue.length);//前一轮还是有不同的时候或者还有需要执行任务的情况下，继续下一次轮询

    while (this.$$postDigestQueue.length) {
        try {
            this.$eval(this.$$postDigestQueue.shift());
        } catch (e) {
            exceptionHandler(e);
        }
    }

    this.$clearPhase();
};

Scope.prototype.$$digestOnce = function () {
    var self = this;
    var newValue, oldValue, dirty;
    _.forEachRight(self.$$watchers, function (watcher) {
        if (!watcher) {
            return;
        }
        try {
            newValue = watcher.watchFn(self);
            oldValue = watcher.last;
            if (!self.areEqual(newValue, oldValue, watcher.valueEq)) {
                //这里需要先放上来，下面可能出现listener中清楚的情况
                self.$$lastDirtyWatch = watcher;
                watcher.listenerFn(newValue, oldValue === initWatchVal ? newValue : oldValue, self);
                watcher.last = watcher.valueEq ? _.cloneDeep(newValue) : newValue;
                dirty = true;
            } else if (self.$$lastDirtyWatch === watcher) {
                return false;
            }
        } catch (e) {
            exceptionHandler(e);
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
    if (self.$$applyAsyncId === null) {
        self.$$applyAsyncId = setTimeout(function () {
            self.$apply(function () {
                self.$$flushApplyAsync();
            });
            self.$$applyAsyncId = null;
        });
    }
};

Scope.prototype.$$flushApplyAsync = function () {
    while (this.$$applyAsynQueue.length) {
        try {
            this.$eval(this.$$applyAsynQueue.shift());
        } catch (e) {
            exceptionHandler(e);
        }
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

Scope.prototype.$$postDigest = function (expr) {
    this.$$postDigestQueue.push(expr);
};

Scope.prototype.$watchGroup = function (watchFns, listenerFn) {
    var self = this;
    var newValues = new Array(watchFns.length);
    var oldValues = new Array(watchFns.length);
    var changeReactionScheduled  = false;
    var firstRun = true;

    if (!watchFns.length) {
        var hasDestroy = false;
        //angularJs会执行一次，这里按照实现写
        this.$evalAsync(function () {
            //firstRun
            if (hasDestroy) {
                return;
            }
            listenerFn(newValues, newValues, self);
        });
        //如果在$digest之前destroy，那么listener就不会运行
        return function () {
            hasDestroy = true;
        };
    }

    var destroyFns = _.map(watchFns, function (watchFn, i) {
        return self.$watch(watchFn, function (newValue, oldValue) {
            newValues[i] = newValue;
            oldValues[i] = oldValue;
            if (!changeReactionScheduled) {
                //这一次$digestOnce最多运行一次listenerFn
                changeReactionScheduled = true;
                self.$evalAsync(function () {
                    //执行之后再放开，保证下一次change的时候还能继续运行listenerFn
                    changeReactionScheduled = false;
                    //如果第一次运行的时候(init的时候)，可以保证newValues === oldValues
                    if (firstRun) {
                        firstRun = false;
                        listenerFn(newValues, newValues, self);
                    } else {
                        listenerFn(newValues, newValues, self);
                    }
                });
            }
        });
    });

    return function () {
        _.forEach(destroyFns, function (destroyFn) {
            destroyFn();
        })
    };

};

Scope.prototype.$new = function () {
    var child = Object.create(this);
    child.$$watchers = [];
    child.$$children = [];
    this.$$children.push(child);
    return child;
    //orElse
    // var ChildScope = function () {  };
    // ChildScope.prototype = this;
    // return new ChildScope();
};

Scope.prototype.$$everyScope = function (fn) {
    if (fn(this)) {
        return this.$$children.every(function (child) {
            return child.$$everyScope(fn);
        });
    } else {
        return false;
    }
};