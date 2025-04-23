from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import cv2
import numpy as np
import shutil
import os

app = FastAPI()

def find_gap_position(full_img_path, piece_img_path):
    full_img = cv2.imread(full_img_path)
    piece_img = cv2.imread(piece_img_path)

    full_gray = cv2.cvtColor(full_img, cv2.COLOR_BGR2GRAY)
    piece_gray = cv2.cvtColor(piece_img, cv2.COLOR_BGR2GRAY)

    result = cv2.matchTemplate(full_gray, piece_gray, cv2.TM_CCOEFF_NORMED)
    _, max_val, _, max_loc = cv2.minMaxLoc(result)

    return {"gap_x": max_loc[0], "confidence": float(max_val)}

@app.post("/solve-captcha/")
async def solve_captcha(background: UploadFile = File(...), piece: UploadFile = File(...)):
    bg_path = f"temp_{background.filename}"
    piece_path = f"temp_{piece.filename}"

    with open(bg_path, "wb") as f:
        shutil.copyfileobj(background.file, f)

    with open(piece_path, "wb") as f:
        shutil.copyfileobj(piece.file, f)

    try:
        result = find_gap_position(bg_path, piece_path)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        os.remove(bg_path)
        os.remove(piece_path)

    return result
