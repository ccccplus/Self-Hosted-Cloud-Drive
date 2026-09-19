import io
import base64
import qrcode

def generate_qr_image(data: str, box_size: int = 10, border: int = 2):
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    return img

def generate_qr_data_url(data: str, box_size: int = 8) -> str:
    img = generate_qr_image(data, box_size=box_size)
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    img_b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{img_b64}"

def generate_qr_png_bytes(data: str, box_size: int = 10) -> bytes:
    img = generate_qr_image(data, box_size=box_size)
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    return buffered.getvalue()
