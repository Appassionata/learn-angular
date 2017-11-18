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

scope.counter = 0;
scope.$$postDigest(function() {
    scope.counter++;
});
expect(scope.counter).toBe(0);
scope.$digest();
expect(scope.counter).toBe(1);
scope.$digest();
expect(scope.counter).toBe(1);