export const formatMoney = (amount) => {
    // 1 Point = 1 Unit
    return `${amount} Pts`;
};

export const getEl = (id) => document.getElementById(id);

export const hideEl = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
};

export const showEl = (id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
};

export const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};
