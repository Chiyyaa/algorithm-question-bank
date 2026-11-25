// Resolve reviewed image filenames on the current deployment, including legacy catalog URLs.
export function localImageUrl(value) {
    if (typeof value !== 'string') return null;
    const match = value.match(/^(?:(?:\.\.\/|\.\/)?images\/|https:\/\/chiyyaa\.github\.io\/algorithm-question-bank\/images\/)([a-zA-Z0-9_-]+\.(?:png|jpe?g|webp|svg))$/);
    return match ? new URL('../images/' + match[1], import.meta.url).href : null;
}
