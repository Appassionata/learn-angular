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
        }
    }
}

var scope = new Scope();

var counter = 0;
scope.aValue = 1;
scope.anotherValue = 2;
scope.$watchGroup([
    function(scope) { return scope.aValue; },
    function(scope) { return scope.anotherValue; }
], function(newValues, oldValues, scope) {
    counter++;
});
scope.$digest();
expect(counter).toEqual(1);