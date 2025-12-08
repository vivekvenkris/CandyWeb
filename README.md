# CandyWeb - Web-based Pulsar Candidate Viewer

A modern web application for viewing and classifying pulsar candidates from MeerKAT telescope surveys. This is a complete reimplementation of the JavaFX CandyJar application using FastAPI and React.



## 📋 Technology Stack

- **Backend:** FastAPI, Pydantic, Uvicorn, SQLAlchemy, SQLite
- **Frontend:** React, Vite, Plotly, Axios, Lucide React
- **Data Processing:** Pandas, NumPy, Astropy


## 🏗️ Project Structure

```
CandyWeb/
├── backend/
│   ├── app/
│   │   ├── models/
│   │   │   ├── candidate.py          # Pydantic models (Candidate, Beam, MetaFile, Pulsar)
│   │   │   └── auth.py               # Authentication models
│   │   ├── services/
│   │   │   ├── candidate_reader.py   # CSV parsing service
│   │   │   ├── metafile_reader.py    # APSUSE metafile parser
│   │   │   ├── harmonic_matcher.py   # Similarity detection algorithm
│   │   │   ├── database.py           # SQLite database for users/sessions
│   │   │   ├── psrcat_search.py      # PSRCAT database integration
│   │   │   └── pulsar_scraper.py     # Pulsar Scraper database search
│   │   ├── routers/
│   │   │   ├── candidates.py         # Candidate API endpoints
│   │   │   ├── files.py              # File management endpoints
│   │   │   ├── auth.py               # Authentication endpoints
│   │   │   └── config.py             # Configuration endpoints
│   │   └── main.py                   # FastAPI application
│   ├── requirements.txt
│   ├── run.sh
│   └── users.db                      # SQLite database (auto-generated)
├── frontend/
│   ├── src/
│   │   ├── components/               # React components
│   │   │   ├── Login.jsx             # Login form
│   │   │   ├── Register.jsx          # User registration
│   │   │   ├── AuthContainer.jsx     # Auth flow manager
│   │   │   ├── DirectorySelector.jsx # Directory picker
│   │   │   ├── UTCSelector.jsx       # UTC filter
│   │   │   ├── FilterDropdown.jsx    # Candidate type filter
│   │   │   ├── BeamMapCanvas.jsx     # Beam visualization
│   │   │   ├── ScatterPlot.jsx       # Parameter scatter plots
│   │   │   ├── Diagnostics.jsx       # Folding commands & DB search
│   │   │   ├── BulkClassify.jsx      # Bulk classification UI
│   │   │   ├── ResizableSplit.jsx    # Split panel layout
│   │   │   └── DraggablePanel.jsx    # Floating windows
│   │   ├── hooks/
│   │   │   ├── useAuth.js            # Authentication hook
│   │   │   ├── useKeyboardShortcuts.js # Keyboard event handler
│   │   │   └── usePersistedState.js  # LocalStorage persistence
│   │   ├── api/
│   │   │   └── client.js             # Axios API client
│   │   └── styles/
│   │       └── App.css               # Application styles
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
└── README.md
```

## 🔧 Installation & Setup

### Prerequisites
- Python 3.9+
- Node.js 18+
- npm or yarn

### Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the server
./run.sh
# Or manually:
python -m app.main
```

The backend will start on `http://localhost:8000`
- API docs available at `http://localhost:8000/docs`
- Health check at `http://localhost:8000/health`

**Default Credentials:**
- Username: `admin`
- Password: `admin`

New users can register via the web interface.

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend will start on `http://localhost:3000`

### Production Build

```bash
# Backend: Use gunicorn or uvicorn with systemd
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4

# Frontend: Build static files
cd frontend
npm run build
# Serve the dist/ folder with nginx or similar
```

## 📡 API Endpoints

### Authentication

- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/register` - Register new user
- `POST /api/auth/logout` - Logout and clear session
- `GET /api/auth/session` - Validate current session

### Candidates

- `POST /api/candidates/load` - Load candidates from CSV
- `POST /api/candidates/filter` - Filter and sort candidates
- `PUT /api/candidates/classify` - Update single candidate classification
- `POST /api/candidates/bulk-classify` - Bulk classify multiple candidates
- `GET /api/candidates/{base_dir}/similar/{line_num}` - Get similar candidates (harmonics)
- `GET /api/candidates/{base_dir}/stats` - Get classification statistics
- `GET /api/candidates/{base_dir}/all` - Get all candidates
- `GET /api/candidates/{base_dir}/metafile` - Get metafile data for beam visualization
- `GET /api/candidates/psrcat/search` - Search PSRCAT database for known pulsars
- `GET /api/candidates/pulsar-scraper/search` - Search Pulsar Scraper database

### Files

- `GET /api/files/list-directories` - List available data directories
- `GET /api/files/image?path={path}` - Serve candidate PNG images
- `POST /api/files/save-classification` - Save all classifications to CSV
- `POST /api/files/load-classification` - Load existing classification from CSV

### Configuration

- `GET /api/config` - Get server configuration (SERVER_DATA_ROOT)

## 🎯 Candidate Classification Types

| Type | Key | Description |
|------|-----|-------------|
| **RFI** | Y | Radio Frequency Interference |
| **NOISE** | U | Noise artifacts |
| **T1_CAND** | I | Tier 1 Candidate (high priority) |
| **T2_CAND** | O | Tier 2 Candidate (lower priority) |
| **KNOWN_PSR** | P | Known Pulsar |
| **NB_PSR** | L | Non-Boresight Pulsar (bright pulsars that are all over the place) |
| **UNCAT** | R | Uncategorized (default) |

## 🔢 Data Models

### Candidate
Contains 40+ fields including:
- Identification: `pointing_id`, `beam_id`, `beam_name`, `source_name`
- Coordinates: `ra`, `dec`, `gl`, `gb` (celestial & galactic)
- Timing: `mjd_start`, `utc_start`
- Frequency: `f0_opt`, `f1_opt` (± errors)
- Acceleration: `acc_opt` (± error)
- Dispersion: `dm_opt` (± error)
- SNR: `sn_fft`, `sn_fold`
- Paths: `png_path`, `metafile_path`, `filterbank_path`, `tarball_path`
- Classification: `candidate_type`
- Classifier scores: Dynamic dictionary of AI classifier outputs

### Harmonic Matching Algorithm

The similarity detection uses frequency harmonics and DM proximity:

```python
# Configuration
freq_tolerance = 1e-4        # Frequency matching tolerance
dm_tolerance = 5.0           # DM difference threshold (pc/cc)
scale_tolerance = False      # Scale tolerance by harmonic number
include_fractions = False    # Include fractional harmonics (1/2, 1/3, etc.)

# Algorithm checks harmonics 1-16 and fractions 1/16 to 16/1
# Two candidates match if:
# 1. |DM1 - DM2| < dm_tolerance
# 2. F2 = F1 * (i/j) ± freq_tolerance for some i,j in 1..16
```

## 📊 CSV File Format

### Input: candidates.csv
```csv
pointing_id,beam_id,beam_name,source_name,ra,dec,gl,gb,mjd_start,utc_start,f0_user,f0_opt,f0_opt_err,f1_user,f1_opt,f1_opt_err,acc_user,acc_opt,acc_opt_err,dm_user,dm_opt,dm_opt_err,sn_fft,sn_fold,pepoch,maxdm_ymw16,dist_ymw16,png_path,metafile_path,filterbank_path,candidate_tarball_path,tobs,pics_palfa,pics_trapum_ter5
1,1,cfbf00001,J1234+5678,12:34:56.78,56:78:90.12,123.45,67.89,59000.5,2023-01-15T12:00:00.000,1.234,1.2345,0.0001,0.0,0.0,0.0,0.0,0.0,0.0,45.6,45.67,0.12,15.4,12.3,59000.5,100.0,5.2,path/to/candidate.png,path/to/meta.json,path/to/filterbank.fil,path/to/tarball.tar.gz,300.0,0.85,0.92
```

### Output: classification.csv
```csv
beamid,utc,png,classification
1,2023-01-15T12:00:00.000,path/to/candidate.png,T1_CAND
```

### Output: classification_full.csv
```csv
[All original columns],classification
[Original CSV line],T1_CAND
```

## 🔬 Diagnostics Features

The application generates ready-to-use folding commands:

### Prepfold Command
```bash
filtool -t 12 -i 0 --telescope meerkat -z zdot --cont -o output -f filterbank.fil;
prepfold -topo -fixchi -dm 45.67 -nsub 64 -npart 64 -f 1.2345 -o output output*.fil
```

### PulsarX Command
```bash
psrfold_fil -v -t 4 --template /path/to/template --dm 45.67 --f0 1.2345 -o output -f filterbank.fil
```

### DSPSR Command
```bash
dspsr -t 4 -k meerkat -b 128 -A -Lmin 15 -L 20 -c 0.810 -D 45.67 -O output filterbank.fil
```

## 🌟 Future Enhancements

### High Priority
- [ ] Export to PDF/HTML reports for a given candidate and report for the entire classification
- [ ] Advanced filtering (regex, range queries, parameter ranges)
- [ ] Display AI classifier values on screen
- [ ] Sort based on custom AI classifier values

### Medium Priority
- [ ] Multi-window/multi-screen support (like original JavaFX app)
- [ ] Candidate comparison view (side-by-side)
- [ ] Annotation/notes per candidate
- [ ] Undo/redo for classifications
- [ ] Dark mode theme


### Low Priority
- [ ] PostgreSQL/MongoDB backend option
- [ ] Email notifications for completed classifications

## 🐛 Known Limitations

1. **In-memory storage**: Current implementation stores candidates in memory; for very large datasets (>10k candidates), consider database backend
2. **Session duration**: Sessions expire after 24 hours; adjust in `database.py` if needed
3. **Metafile format**: Primarily supports APSUSE JSON format; text format parser is simplified
4. **Concurrent users**: Multiple users can work simultaneously, but classifications may conflict if working on same dataset. Need a way to name a candidate as "taken" in real time.

## 📝 Development Status

### ✅ Completed Features

**Backend (100%)**
- ✅ FastAPI application with OpenAPI docs
- ✅ Pydantic data models (Candidate, Beam, MetaFile, Pulsar)
- ✅ CSV parsing with dynamic classifier score detection
- ✅ Metafile parsing (APSUSE JSON format)
- ✅ Harmonic matching algorithm (16 harmonics + fractional)
- ✅ Classification endpoints (single + bulk)
- ✅ File management (image serving, save/load CSV)
- ✅ SQLite database for user management
- ✅ Session-based authentication (24-hour expiry)
- ✅ PSRCAT database integration
- ✅ Pulsar Scraper database search
- ✅ Diagnostics command generation (prepfold, pulsarx, dspsr)

**Frontend (95%)**
- ✅ Vite + React setup with HMR
- ✅ Authentication UI (login, register, logout)
- ✅ Session persistence across page refreshes
- ✅ Directory selection and navigation
- ✅ Candidate filtering and sorting
- ✅ Classification controls with keyboard shortcuts
- ✅ PNG image viewer with full-screen mode
- ✅ Beam map visualization (canvas-based with pan/zoom)
- ✅ Scatter plot (Plotly with 10+ parameters)
- ✅ Diagnostics panel with database search
- ✅ Bulk classification UI
- ✅ Resizable split panels and floating windows
- ✅ Real-time classification stats
- ✅ Save/download classifications (server + local CSV)
- ✅ Candidate info table with all parameters

### 🔨 In Progress

- ⏳ Performance optimization for large datasets (>5000 candidates)
- ⏳ Comprehensive error handling and user feedback
- ⏳ Unit and integration tests

### 📋 Next Steps

1. Add WebSocket support for real-time multi-user updates
2. Implement candidate comparison view
3. Add advanced filtering (parameter ranges, regex)
4. Create deployment documentation
5. Set up CI/CD pipeline


## 📚 References

- Original CandyJar (JavaFX): https://github.com/vivekvenkris/CandyJar
- TRAPUM Survey: https://www.trapum.org/
- PRESTO: https://github.com/scottransom/presto
- PulsarX: https://github.com/ypmen/PulsarX
- DSPSR: http://dspsr.sourceforge.net/

## 👨‍💻 Author

Reimplemented from the original JavaFX CandyJar by Vivek Venkatraman Krishnan

---

