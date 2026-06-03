const API_ROOT = (process.env.REACT_APP_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

export function uploadUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_ROOT}${path.startsWith('/') ? path : `/${path}`}`;
}

export function hasMatchScore(score) {
  return score !== null && score !== undefined && score !== '';
}
