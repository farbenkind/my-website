
function plotUnitSquare(values, width = 500, height =500) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.style.border = "1px solid #444";

    const ctx = canvas.getContext("2d");

    // Hintergrund
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, width, height);

    // Achsen
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 5;

    // x-Achse
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(width, height);
    ctx.stroke();

    // y-Achse
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, height);
    ctx.stroke();

    // Kurve
    ctx.strokeStyle = "#0f0";
    ctx.lineWidth = 2;

    ctx.beginPath();
    for (let i = 0; i < values.length; i++) {
        const x = (i / (values.length - 1)) * width;
        const y = height - values[i] * height; // invert y

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    return canvas;
}

function myPow(base, exp) {
    if (exp > 0)
        return Math.pow(base, exp);
    return Math.pow(base, 1 / -exp)
}
function myFkt(x, exp) {
    if (exp < 0)
        exp = 1/exp;
    if (x>0) {
        return .5+.5*Math.pow(x, exp)
    }
    else {
        return .5-.5*Math.pow(-x, exp)
    }
}  
let arr = [];
for (let i = -500; i <= 500; i++) {
    const x = i / 500;
    const y = myFkt(x, .5); // Beispiel: Power-Kurve
    arr.push(y);
}
document.body.appendChild(plotUnitSquare(arr));




