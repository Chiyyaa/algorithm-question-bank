// 每個單元指向獨立題庫；尚未有資料的單元保持 dataUrl: null。
export const SUBJECTS = [
    {
        id: "algorithm", name: "演算法", available: true, defaultUnit: "u6",
        units: [
            { id: "u2", name: "U2", questionCount: 63, dataUrl: "../data/questions.json" },
            { id: "u3", name: "U3", questionCount: 62, dataUrl: "../data/algorithm-u3.json" },
            { id: "u4", name: "U4", questionCount: 60, dataUrl: "../data/algorithm-u4.json" },
            { id: "u6", name: "U6", questionCount: 74, dataUrl: "../data/algorithm-u6.json" },
            { id: "u7", name: "U7", questionCount: 60, dataUrl: "../data/algorithm-u7.json" }
        ]
    },
    { id: "os", name: "作業系統", available: true, defaultUnit: "u3", units: [
        { id: "u2", name: "U2", questionCount: 59, dataUrl: "../data/os-u2.json" },
        { id: "u3", name: "U3", questionCount: 294, dataUrl: "../data/os-u3.json" },
        { id: "u4", name: "U4", questionCount: 147, dataUrl: "../data/os-u4.json" },
        { id: "u5", name: "U5", questionCount: 127, dataUrl: "../data/os-u5.json" },
        { id: "u6", name: "U6", questionCount: 234, dataUrl: "../data/os-u6.json" }
    ] }
];

export function getUnit(subjectId, unitId) {
    const subject = SUBJECTS.find(item => item.id === subjectId && item.available);
    return subject?.units.find(item => item.id === unitId && (item.dataUrl || item.sharedOnly));
}

// Only pass published counts on the public page; collaborators may pass their private registry.
export function mergeCollaborationUnits(rows) {
    for (const row of rows) {
        const subject = SUBJECTS.find(s => s.id === row.subject_id);
        if (!subject || !/^u(?:[2-9]|[1-9][0-9]{1,2})$/.test(row.unit_id)) continue;
        if (!subject.units.some(u => u.id === row.unit_id))
            subject.units.push({id:row.unit_id,name:row.unit_id.toUpperCase(),questionCount:0,dataUrl:null,sharedOnly:true});
        subject.units.sort((a,b) => Number(a.id.slice(1))-Number(b.id.slice(1)));
    }
}

