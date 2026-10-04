// 每個單元指向獨立題庫；尚未有資料的單元保持 dataUrl: null。
export const SUBJECTS = [
    {
        id: "algorithm", name: "演算法", available: true, defaultUnit: "u2",
        units: [
            { id: "u1", name: "U1", dataUrl: null },
            { id: "u2", name: "U2", dataUrl: "../data/questions.json" },
            { id: "u3", name: "U3", dataUrl: null }
        ]
    },
    { id: "os", name: "作業系統", available: false, units: [] }
];

export function getUnit(subjectId, unitId) {
    const subject = SUBJECTS.find(item => item.id === subjectId && item.available);
    return subject?.units.find(item => item.id === unitId && item.dataUrl);
}
