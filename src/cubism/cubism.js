/**
 * Derivative work of https://github.com/misskey-dev/mascot-web
 * MIT License
 *
 * Copyright (c) 2021 Misskey Development Division
 * Derivative work copyright (c) 2024 ninePLUS
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import {
    LogLevel,
    CubismFramework
} from "./framework/src/live2dcubismframework";
import {CubismMoc} from "./framework/src/model/cubismmoc";
import {CubismClippingManager_WebGL, CubismRenderer_WebGL} from "./framework/src/rendering/cubismrenderer_webgl";

import {FileReferences} from "../../public/resources/cubism/hiyori_pro/hiyori_pro_t11.model3.json";
import {CubismModelMatrix} from "./framework/src/math/cubismmodelmatrix";
import {CubismMatrix44} from "./framework/src/math/cubismmatrix44";
import {CubismModelSettingJson} from "./framework/src/cubismmodelsettingjson";
import {CubismEyeBlink} from "./framework/src/effect/cubismeyeblink";
import {BreathParameterData, CubismBreath} from "./framework/src/effect/cubismbreath";
import {csmVector} from "./framework/src/type/csmvector";
import {CubismMotionManager} from "./framework/src/motion/cubismmotionmanager";
import {CubismMotion} from "./framework/src/motion/cubismmotion";
const modelBase = "/cubism/hiyori_pro/"

CubismFramework.startUp({
    logFunction: console.log,
    loggingLevel: LogLevel.LogLevel_Verbose
});

CubismFramework.initialize();

document.addEventListener('focus', (event) => {
    if (event.target.matches && event.target.matches('input, textarea, select')) {
        window.cubismColonO = true;
    }
}, true);
document.addEventListener('blur', (event) => {
    if (event.target.matches && event.target?.matches('input, textarea, select')) {
        window.cubismColonO = false;
    }
}, true);

fetch(`${modelBase}${FileReferences.Moc}`).then(res => res.arrayBuffer()).then(async arrayBuffer => {
    const style = document.createElement('style');
    style.textContent = `
                #cubism {
                    position: fixed;
                    left: -140px;
                    bottom: -250px;
                    pointer-events: none;
                }
            `;
    document.head.appendChild(style);

    const settingsBuffer = await fetch(`${modelBase}${FileReferences.Moc.replace(".moc3",".model3.json")}`).then(res => res.arrayBuffer());

    let modelSetting = new CubismModelSettingJson(settingsBuffer, settingsBuffer.byteLength);
    let moc = CubismMoc.create(arrayBuffer, arrayBuffer.byteLength);
    let model = moc.createModel();
    let renderer = new CubismRenderer_WebGL();
    let canvas = document.createElement('canvas');
    canvas.id = "cubism";
    canvas.width = 600;
    canvas.height = 600;
    document.body.appendChild(canvas);
    let gl = canvas.getContext('webgl2');
    let frameBuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    renderer.startUp(gl);

    let eyeBlink;
    if(modelSetting.getEyeBlinkParameterCount() > 0)
    {
        eyeBlink = CubismEyeBlink.create(modelSetting);
    }

    let breath = CubismBreath.create();
    let breathParameters = new csmVector();
    breathParameters.pushBack(new BreathParameterData(CubismFramework.getIdManager().getId("ParamAngleX"), 0.0, 15.0, 6.5345, 0.5));
    breathParameters.pushBack(new BreathParameterData(CubismFramework.getIdManager().getId("ParamAngleY"), 0.0, 8.0, 3.5345, 0.5));
    breathParameters.pushBack(new BreathParameterData(CubismFramework.getIdManager().getId("ParamAngleZ"), 0.0, 10.0, 5.5345, 0.5));
    breathParameters.pushBack(new BreathParameterData(CubismFramework.getIdManager().getId("ParamBreath"), 0.5, 0.5, 3.2345, 1));
    breath.setParameters(breathParameters);

    let motionManager = new CubismMotionManager();

    window.cubismMotion = function(motionPath, priority = 2) {
        fetch(motionPath).then(res => res.arrayBuffer()).then(arrayBuffer => {
            let motion = CubismMotion.create(arrayBuffer, arrayBuffer.byteLength)
            if(!motion._eyeBlinkParameterIds) motion._eyeBlinkParameterIds = new csmVector();
            if(!motion._lipSyncParameterIds) motion._lipSyncParameterIds = new csmVector();
            motionManager.startMotionPriority(motion, true, priority);
        })
    }

    let i = 0;
    for (const texture of FileReferences.Textures) {
        const image = new Image();
        image.onload = () => {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.generateMipmap(gl.TEXTURE_2D);

            renderer.bindTexture(i, tex);
            i++;
        }
        image.src = `${modelBase}${texture}`;
    }

    renderer.setIsPremultipliedAlpha(true);
    renderer.initialize(model);

    function resizeModel() {
        let modelMatrix = new CubismModelMatrix(model.getCanvasWidth(), model.getCanvasHeight());
        let projectionMatrix =  new CubismMatrix44();
        projectionMatrix.scale(1, 1);
        projectionMatrix.multiplyByMatrix(modelMatrix);
        renderer.setMvpMatrix(projectionMatrix);
    } resizeModel();

    const point = {
        angleX: 0,
        angleY: 0,
        angleZ: 0,
        angleEyeX: 0,
        angleEyeY: 0,

        mouseDistance: 0
    }

    document.body.addEventListener("mousemove", function(e) {
        if(window.cubismNoMouse) return;
        const x = e?.clientX || 0
        const y = e?.clientY || 0
        const rect = canvas.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const distance = getDistance(x, y, cx, cy)
        const dx = cx - x
        const dy = cy - y
        const angle = getAngle(x, y, cx, cy)
        const r = Math.cos(angle) * Math.sin(angle) * 180 / Math.PI

        updatePoint({
            angleX: -dx / 10,
            angleY: dy / 10,
            angleZ: r * (distance / cx),
            angleEyeX: -dx / cx,
            angleEyeY: dy / cy,
        })
    })
    function updatePoint(newPoint) {
        Object.assign(point, newPoint)
    }

    let lastUpdateTime = Date.now();
    const idManager = CubismFramework.getIdManager();
    renderer._clippingManager.setGL(gl);
    function loop() {
        const time = Date.now();
        const deltaTimeSeconds = (time - lastUpdateTime) / 1000;

        model.setParameterValueById(idManager.getId('ParamAngleX'), point.angleX, .5)
        model.setParameterValueById(idManager.getId('ParamAngleY'), point.angleY, .5)
        model.setParameterValueById(idManager.getId('ParamAngleZ'), point.angleZ, .5)
        model.setParameterValueById(idManager.getId('ParamEyeBallX'), point.angleEyeX, .5)
        model.setParameterValueById(idManager.getId('ParamEyeBallY'), point.angleEyeY, .5)
        model.setParameterValueById(idManager.getId('ParamMouthOpenY'), window.cubismColonO ? 1 : 0, .5)
        model.setParameterValueById(idManager.getId('ParamBodyAngleZ'), point.angleZ / 2, .05)
        model.setPartOpacityById(CubismFramework.getIdManager().getId("PartArmB"), 0);

        eyeBlink.updateParameters(model, deltaTimeSeconds);
        breath.updateParameters(model, deltaTimeSeconds);
        motionManager.updateMotion(model, deltaTimeSeconds);

        model.saveParameters()
        model.update()

        renderer.setRenderState(frameBuffer, [0, 0, canvas.width, canvas.height])
        renderer.drawModel();

        lastUpdateTime = time;

        requestAnimationFrame(loop);
    }
    loop();
    window.dispatchEvent(new Event("cubismready"));
})

export function getDistance(x1, y1, x2, y2) {
    return Math.sqrt(
        Math.pow(x2 - x1, 2) +
        Math.pow(y2 - y1, 2)
    )
}
export function getAngle(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1)// * 180 / Math.PI
}