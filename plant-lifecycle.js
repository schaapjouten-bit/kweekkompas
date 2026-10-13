(function(root) {
    function shouldAdvanceToGrowing(seed, today = new Date()) {
        if (seed?.status !== 'Gezaaid' || typeof seed.sownAt !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(seed.sownAt)) return false;
        const [year, month, day] = seed.sownAt.split('-').map(Number);
        const sown = new Date(year, month - 1, day);
        if (sown.getFullYear() !== year || sown.getMonth() !== month - 1 || sown.getDate() !== day) return false;
        const nextMonth = new Date(year, month, 1);
        const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
        const due = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(day, lastDay));
        return today >= due;
    }
    const api = { shouldAdvanceToGrowing };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.KweekPlantLifecycle = api;
})(globalThis);
