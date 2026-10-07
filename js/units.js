// 每個單元指向獨立題庫；尚未有資料的單元保持 dataUrl: null。
export const SUBJECTS = [
    {
        id: "algorithm", name: "演算法", available: true, defaultUnit: "u3",
        units: [
            { id: "u2", name: "U2", questionCount: 60, dataUrl: "../data/questions.json" },
            { id: "u3", name: "U3", questionCount: 60, dataUrl: "../data/algorithm-u3.json" },
            { id: "u4", name: "U4", questionCount: 59, dataUrl: "../data/algorithm-u4.json" }
        ]
    },
    { id: "os", name: "作業系統", available: true, defaultUnit: "u3", units: [
        { id: "u3", name: "U3", questionCount: 204, dataUrl: "../data/os-u3.json" },
        { id: "u4", name: "U4", questionCount: 104, dataUrl: "../data/os-u4.json" }
    ] }
];

export function getUnit(subjectId, unitId) {
    const subject = SUBJECTS.find(item => item.id === subjectId && item.available);
    return subject?.units.find(item => item.id === unitId && item.dataUrl);
}

