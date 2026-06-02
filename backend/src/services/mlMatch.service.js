const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const DEFAULT_MODEL_PATH = path.join(__dirname, '..', '..', 'ml', 'models', 'match_score_model.joblib');
const DEFAULT_PREDICT_SCRIPT = path.join(__dirname, '..', '..', 'ml', 'predict_match_score.py');

class MlMatchService {
    constructor() {
        this.modelPath = process.env.ML_MATCH_MODEL_PATH || DEFAULT_MODEL_PATH;
        this.pythonPath = process.env.ML_PYTHON_PATH || 'python';
    }

    isModelAvailable() {
        return fs.existsSync(this.modelPath);
    }

    async predictMatchScore(payload) {
        if (!this.isModelAvailable()) {
            return null;
        }

        return new Promise((resolve) => {
            const args = [DEFAULT_PREDICT_SCRIPT, '--model', this.modelPath];
            const child = spawn(this.pythonPath, args);
            let stdout = '';
            const timeoutId = setTimeout(() => {
                child.kill();
            }, 15000);

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.on('error', (error) => {
                console.error('ML match score error:', error.message);
                return resolve(null);
            });

            child.on('close', () => {
                clearTimeout(timeoutId);
                try {
                    const parsed = JSON.parse(stdout);
                    if (parsed && typeof parsed.score === 'number') {
                        return resolve(parsed);
                    }
                } catch (parseError) {
                    console.error('ML match score parse error:', parseError.message);
                }

                return resolve(null);
            });

            try {
                child.stdin.write(JSON.stringify(payload));
                child.stdin.end();
            } catch (error) {
                console.error('ML match score stdin error:', error.message);
                return resolve(null);
            }
        });
    }
}

module.exports = new MlMatchService();
