from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
import asyncio
import ollama
import re
import glob
import os

# Loading data libraries
from langchain.document_loaders import TextLoader, DirectoryLoader
from langchain.text_splitter import CharacterTextSplitter
from langchain.schema import Document

from langchain.vectorstores import FAISS

# Langchain RAG
from langchain.memory import ConversationBufferMemory
from langchain.chains import ConversationalRetrievalChain
from langchain_ollama import OllamaEmbeddings, ChatOllama

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
MODEL = "llama3.2"
EMBEDDING_MODEL = "nomic-embed-text"

app = FastAPI()

app.mount("/static", StaticFiles(directory=BASE_DIR/"static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR/"templates")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

folders = glob.glob(str(DATA_DIR / "knowledge-base/*"))
text_loader_kwargs = {'encoding': 'utf-8'}

documents = []
for folder in folders:
    doc_type = os.path.basename(folder)
    loader = DirectoryLoader(folder, glob="**/*.md", loader_cls=TextLoader, loader_kwargs=text_loader_kwargs)
    folder_docs = loader.load()
    for doc in folder_docs:
        doc.metadata["type"] = doc_type
        documents.append(doc)

text_splitter = CharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
chunks = text_splitter.split_documents(documents)

doc_types = set([chunk.metadata['type'] for chunk in chunks])

embeddings = OllamaEmbeddings(model=EMBEDDING_MODEL)
vectorstore = FAISS.from_documents(chunks, embeddings)

# RAG
llm = ChatOllama(temperature=0.7, model=MODEL)
memory = ConversationBufferMemory(memory_key="chat_history", return_messages=True)
retriever = vectorstore.as_retriever()
conversation_chain = ConversationalRetrievalChain.from_llm(llm=llm, retriever=retriever, memory=memory)

@app.get("/")
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request, "data": "Hello, FastAPI with Jinja2!"})

@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            query = await websocket.receive_text()
            
            response_text = chat(query)
            
            words = re.findall(r'\S+|\n+', response_text)
            
            for word in words:
                await websocket.send_json({
                    "type": "stream",
                    "content": word if word.startswith('\n') else word + " "
                })
                await asyncio.sleep(0.05)  # Giả lập độ trễ để tạo hiệu ứng typing
                
            await websocket.send_json({
                "type": "end",
                "content": ""
            })
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error: {e}")
        
def chat(query: str):
    try:
        # Kiểm tra query có rỗng không
        if not query or not query.strip():
            return "Please provide a valid question."
        
        # Invoke conversation chain
        response = conversation_chain.invoke({"question": query})
        
        # Trả về answer từ response
        return response.get('answer', 'Sorry, I could not generate a response.')
    
    except Exception as e:
        print(f"Error in chat function: {e}")
        return f"An error occurred: {str(e)}"
            