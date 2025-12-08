import axios from 'axios'

// Create axios instance with base configuration
const api = axios.create({
  baseURL: '/api',  // Proxied to backend via Vite
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

// ============= Config Endpoints =============

export const getConfig = () => api.get('/config')

// ============= Files Endpoints =============

export const listDirectories = (serverRoot = null) => {
  const params = serverRoot ? { server_root: serverRoot } : {}
  return api.get('/files/list-directories', { params })
}

export const getImage = (imagePath) => {
  return api.get('/files/image', {
    params: { path: imagePath },
    responseType: 'blob',
  })
}

export const saveClassification = (baseDir, filename, candidates, csvHeader) => {
  return api.post('/files/save-classification', {
    base_dir: baseDir,
    filename,
    candidates,
    csv_header: csvHeader,
  })
}

export const loadClassification = (baseDir, filename) => {
  return api.post('/files/load-classification', {
    base_dir: baseDir,
    filename,
  })
}

// ============= Candidates Endpoints =============

export const loadCandidates = (csvPath, baseDir) => {
  return api.post('/candidates/load', {
    csv_path: csvPath,
    base_dir: baseDir,
  })
}

export const filterCandidates = (baseDir, utc, types, sortBy = 'FOLD_SNR', sortOrder = 'desc') => {
  return api.post('/candidates/filter', {
    base_dir: baseDir,
    utc,
    types,
    sort_by: sortBy,
    sort_order: sortOrder,
  })
}

export const classifyCandidate = (baseDir, lineNum, candidateType) => {
  return api.put('/candidates/classify', {
    base_dir: baseDir,
    line_num: lineNum,
    candidate_type: candidateType,
  })
}

export const bulkClassify = (baseDir, lineNums, candidateType, onlySameBeam = false, beamName = null) => {
  return api.post('/candidates/bulk-classify', {
    base_dir: baseDir,
    line_nums: lineNums,
    candidate_type: candidateType,
    only_same_beam: onlySameBeam,
    beam_name: beamName,
  })
}

export const getSimilarCandidates = (baseDir, lineNum) => {
  return api.get(`/candidates/${baseDir}/similar/${lineNum}`)
}

export const getStats = (baseDir) => {
  return api.get(`/candidates/${baseDir}/stats`)
}

export const getAllCandidates = (baseDir) => {
  return api.get(`/candidates/${baseDir}/all`)
}

export const getMetafile = (baseDir, utc = null) => {
  const params = utc ? { utc } : {}
  return api.get(`/candidates/${baseDir}/metafile`, { params })
}

export const searchPulsarScraper = (baseDir, lineNum) => {
  return api.get('/candidates/pulsar-scraper/search', {
    params: {
      base_dir: baseDir,
      line_num: lineNum,
    },
  })
}

export const searchPsrcat = (baseDir, lineNum) => {
  return api.get('/candidates/psrcat/search', {
    params: {
      base_dir: baseDir,
      line_num: lineNum,
    },
  })
}

export default api
