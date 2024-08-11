import logging
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch
from flask_caching import Cache
from flask_sqlalchemy import SQLAlchemy
from threading import Thread

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

# Set up caching
cache = Cache(app, config={'CACHE_TYPE': 'simple'})

# Set up database
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///feedback.db'
db = SQLAlchemy(app)

# Global variables
model_name = "EleutherAI/gpt-neo-1.3B"  # Using a smaller model for better performance
tokenizer = None
model = None
model_loaded = False
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

def load_model():
    global tokenizer, model, model_loaded
    try:
        logger.info(f"Loading model {model_name} on {device}")
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForCausalLM.from_pretrained(model_name).to(device)
        model_loaded = True
        logger.info("Model loaded successfully")
    except Exception as e:
        logger.error(f"Error loading model: {str(e)}")

# Start loading the model in a separate thread
Thread(target=load_model).start()

class Feedback(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    prompt = db.Column(db.String(500))
    generated_code = db.Column(db.Text)
    user_rating = db.Column(db.Integer)
    user_correction = db.Column(db.Text)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/model_status')
def model_status():
    return jsonify({'loaded': model_loaded})

@app.route('/generate_code', methods=['POST'])
@cache.memoize(timeout=3600)  # Cache for 1 hour
def generate_code():
    if not model_loaded:
        return jsonify({'error': 'Model is still loading. Please try again later.'}), 503

    try:
        data = request.json
        prompt = data.get('prompt', '')
        language = data.get('language', 'python')
        conversation_history = data.get('conversation_history', [])

        full_prompt = f"Generate {language} code for the following task:\n{prompt}\n\nCode:\n"
        for message in conversation_history:
            full_prompt += f"{message['role']}: {message['content']}\n"

        # Set clean_up_tokenization_spaces to True to avoid future warnings
        inputs = tokenizer(full_prompt, return_tensors='pt', padding=True, truncation=True, clean_up_tokenization_spaces=True).to(device)
        
        with torch.no_grad():
            outputs = model.generate(
                inputs.input_ids,
                max_length=500,
                num_return_sequences=1,
                temperature=0.7,
                top_p=0.95,
                do_sample=True
            )
        
        generated_code = tokenizer.decode(outputs[0], skip_special_tokens=True)
        clean_code = clean_generated_code(generated_code, language)
        analysis_result = analyze_code(clean_code, language)
        
        return jsonify({'code': clean_code, 'analysis': analysis_result})
    except Exception as e:
        logger.error(f"Error in generate_code: {str(e)}")
        return jsonify({'error': str(e)}), 500

def clean_generated_code(code, language):
    lines = code.split('\n')
    cleaned_lines = [line for line in lines if line.strip()]
    return '\n'.join(cleaned_lines)

def analyze_code(code, language):
    analysis = []
    if language == 'python':
        if 'import' not in code:
            analysis.append("Consider adding necessary imports.")
        if 'def' not in code:
            analysis.append("Consider defining functions for better code organization.")
    elif language == 'javascript':
        if 'function' not in code and '=>' not in code:
            analysis.append("Consider using functions or arrow functions for better code organization.")
        if 'const' not in code and 'let' not in code:
            analysis.append("Consider using 'const' or 'let' for variable declarations.")
    
    return "\n".join(analysis) if analysis else "No specific suggestions."

@app.route('/submit_feedback', methods=['POST'])
def submit_feedback():
    data = request.json
    feedback = Feedback(
        prompt=data['prompt'],
        generated_code=data['generated_code'],
        user_rating=data['rating'],
        user_correction=data['correction']
    )
    db.session.add(feedback)
    db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/gpu_memory')
def gpu_memory():
    if torch.cuda.is_available():
        return jsonify({
            'total': torch.cuda.get_device_properties(0).total_memory,
            'allocated': torch.cuda.memory_allocated(0),
            'cached': torch.cuda.memory_reserved(0)
        })
    else:
        return jsonify({'error': 'CUDA not available'})

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)