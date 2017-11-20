function expect(x) {
    return {
        toBe: function (y) {
            console.info(x === y);
        },
        toThrow: function () {
            try {
                x();
                console.info(false);
            } catch (e) {
                console.info(true);
            }
        },
        toEqual: function (y) {
            console.info(x === y);
        },
        toBeUndefined: function () {
            console.info(x === undefined);
        }
    }
}

var parent = new Scope();
var child = parent.$new();
parent.aValue = 'abc';
child.$watch(
    function(scope) { return scope.aValue; },
    function(newValue, oldValue, scope) {
        scope.aValueWas = newValue;
    }
);
parent.$digest();
expect(child.aValueWas).toBe('abc');