import * as THREE from 'three';

import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const PostProcShader = {
    uniforms: {
        'tDiffuse': {
            value: null
        },
        'resolution': {
            value: [500, 500]
        },
        'seed1': {
            value: fxrandom(.45, 1.65)
        },
        'seed2': {
            value: fxrandom(.5, 1.5)
        },
        'seed3': {
            value: fxrandom(.5, 1.5)
        },
    },
    vertexShader:
/* glsl */
`

    varying vec2 vUv;

    void main() {

        vUv = uv;

        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

    }`,
    fragmentShader:
/* glsl */
`

    #include <common>

    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float seed1;
    uniform float seed2;
    uniform float seed3;

    varying vec2 vUv;

    //uniform float sigma;     // The sigma value for the gaussian function: higher value means more blur
                         // A good value for 9x9 is around 3 to 5
                         // A good value for 7x7 is around 2.5 to 4
                         // A good value for 5x5 is around 2 to 3.5
                         // ... play around with this based on what you need :)

    //uniform float blurSize;  // This should usually be equal to
                            // 1.0f / texture_pixel_width for a horizontal blur, and
                            // 1.0f / texture_pixel_height for a vertical blur.

    const float pi = 3.14159265f;

    const float numBlurPixelsPerSide = 4.0f;
 

    vec4 blur(vec2 coor, float blurSize, vec2 direction){
        float sigma = 3.0;
        // Incremental Gaussian Coefficent Calculation (See GPU Gems 3 pp. 877 - 889)
        vec3 incrementalGaussian;
        incrementalGaussian.x = 1.0f / (sqrt(2.0f * pi) * sigma);
        incrementalGaussian.y = exp(-0.5f / (sigma * sigma));
        incrementalGaussian.z = incrementalGaussian.y * incrementalGaussian.y;
      
        vec4 avgValue = vec4(0.0f, 0.0f, 0.0f, 0.0f);
        float coefficientSum = 0.0f;
      
        // Take the central sample first...
        avgValue += texture2D(tDiffuse, coor.xy) * incrementalGaussian.x;
        coefficientSum += incrementalGaussian.x;
        incrementalGaussian.xy *= incrementalGaussian.yz;
      
        // Go through the remaining 8 vertical samples (4 on each side of the center)
        for (float i = 1.0f; i <= numBlurPixelsPerSide; i++) { 
          avgValue += texture2D(tDiffuse, coor.xy - i * blurSize * 
                                direction) * incrementalGaussian.x;         
          avgValue += texture2D(tDiffuse, coor.xy + i * blurSize * 
                                direction) * incrementalGaussian.x;         
          coefficientSum += 2. * incrementalGaussian.x;
          incrementalGaussian.xy *= incrementalGaussian.yz;
        }
      
        return avgValue / coefficientSum;
    }

    void main() {

        vec2 xy = gl_FragCoord.xy;
        vec2 uv = xy / resolution;
        
        float qq = pow(2.*abs(uv.x-.5), 2.)*.84;

        qq = pow(length((uv - .5)*vec2(.72,1.))/length(vec2(.5)), 2.) * .94;

        vec2 dir = uv - .5;
        dir = vec2(dir.y, -dir.x);
        dir = dir / length(dir);

        vec4 texelB = blur(uv, qq*2.*1./resolution.x, dir);

        float lum = texelB.r * 0.3 + texelB.g * 0.59 + texelB.b * 0.11;
        lum = pow(lum, 0.15);
        vec4 texelGray = vec4(vec3( lum ), 1.0);
        texelGray = texelGray*0.5 + texelB*0.5;

        vec4 texel = texture2D( tDiffuse, (xy+vec2(+0.0, +0.0)) / resolution );
        vec4 texel0 = texture2D( tDiffuse, vec2(.5) );

        //vec4 res = texelB*(1.-qq) + texelGray*qq + .0*(-.5+rand(xy*.1));
        texelB.r = pow(texelB.r, seed1);
        //texelB.g = pow(texelB.g, seed2);
        //texelB.b = pow(texelB.b, seed3);
        float pp = (texelB.x+texelB.y+texelB.z)/3.;
        //texelB.x = texel.x + .2*(pp-texel.x);
        texelB.y = texel.y + .2*(pp-texel.y);
        texelB.z = texel.z + .2*(pp-texel.z);
        vec4 res = texelB + .07*(-.5+rand(xy*.1));

        gl_FragColor = vec4( res.rgb, 1.0 );

    }`
};
// note about the fxrand() function 
// when the "fxhash" is always the same, it will generate the same sequence of
// pseudo random numbers, always

//----------------------
// defining features
//----------------------
// You can define some token features by populating the $fxhashFeatures property
// of the window object.
// More about it in the guide, section features:
// [https://fxhash.xyz/articles/guide-mint-generative-token#features]
//
// window.$fxhashFeatures = {
//   "Background": "Black",
//   "Number of lines": 10,
//   "Inverted": true
// }

let camera, scene, renderer;
var vShader, fShader;
var loaded = false;

var points;
var ress = 1000;
var baseWidth = 1;
var baseHeight = 1;
var canvasWidth = 1;
var canvasHeight = 1;
var winScale = 1.;
var pg;
var canvas;
var paletteCanvas;

var seed = fxrand()*10000;

function fxrandom(a, b){
    return a + (b - a)*fxrand();
}
var wind = 0.0;
var scrollscale = 1.3;
var globalIndex = 0;
var frameCount = 0;
var particlePositions = [];
var particleColors = [];
var particleSizes = [];
var particleAngles = [];
var particleIndices = [];

var horizon = fxrandom(0.7, 0.93);

var treeGroundSpread;

var sunPos;
var sunColor;
var sunSpread;

var backgroundColor;

var offcl = [fxrandom(-42, 14), fxrandom(-37, 34), fxrandom(-37, 37)]
var skyclr = {
    a: [155, 121, 122, 255],
    ad: [88, 22, 22, 0],
    b: [88, 77, 83, 88],
    bd: [11, 55, 17, 88],
    c: [130, 85, 62, 255],
    cd: [39, 25, 22, 0],
}


var treeclr = {
    a: [154, 82, 70, 255],
    ad: [39, 25, 22, 0],
    b: [191, 95, 80, 255],
    bd: [39, 25, 22, 0],
    c: [183, 82, 70, 188],
    cd: [39, 25, 22, 33],
    d: [88, 77, 83, 118],
    dd: [11, 28, 17, 55],
    e: [88, 77, 83, 140],
    ed: [39, 25, 22, 30],
}

var groundclr = {
    c: [166, 134, 69, 255],
    cd: [49, 25, 22, 0],
    b: [88, 77, 99, 188],
    bd: [11, 28, 17, 55],
    a: [200, 125, 62, 255],
    ad: [44, 25, 22, 0],
}

var orange = {
    a: [216, 85, 22, 255],
    ad: [39, 25, 22, 0],
    b: [88, 77, 83, 127],
    bd: [11, 28, 17, 127],
}

var indigo = { // old sky
    a: [102, 153, 220, 255],
    ad: [2, 5, 25, 0],
    b: [227, 233, 111, 16],
    bd: [5, 11, 111, 16],
}


function isMobile() {
    let check = false;
    (function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) check = true;})(navigator.userAgent||navigator.vendor||window.opera);
    return check;
  };

function power(p, g) {
    if (p < 0.5)
        return 0.5 * Math.pow(2*p, g);
    else
        return 1 - 0.5 * Math.pow(2*(1 - p), g);
}


function dist(x1, y1, x2, y2){
    return Math.sqrt((x2-x1)**2 + (y2-y1)**2);
}

/*function animate() {
    
    //requestAnimationFrame(animate);
    if(renderer){
        points.material.uniforms.u_time.value = frameCount++;
        points.material.uniforms.u_scrollscale.value = scrollscale;
        renderer.render(scene, camera);
    }
    else{
        requestAnimationFrame(animate);
    }
}*/



function draw(){
    //image(pg, 0, 0, canvas.width, canvas.height);
}

function getHorizon(x){
    var dispr = .5*baseHeight*(-.5*power(noise(x*0.003+3133.41), 3))
    return baseHeight*horizon + (1. - horizon*.8)*.6*baseHeight*(-.5*power(noise(x*0.003), 2)) + .0*dispr*fxrand();
}

function map(x, v1, v2, v3, v4){
    return (x-v1)/(v2-v1)*(v4-v3)+v3;
}

function max(x, y){
    if(x >= y)
        return x;
    return y;
}

function min(x, y){
    if(x <= y)
        return x;
    return y;
}

function constrain(x, a, b){
    return max(a, min(x, b));
}

function radians(angle){
    return angle/360.*2*3.14159;
}

function reset(){
	
    var ns = fxrandom(0, 100000);
    noiseSeed(ns);
    globalIndex = 0;
    scrollscale = 1.3;
    frameCount = 0;
    offcl = [fxrandom(-18, 18), fxrandom(-18, 18), fxrandom(-18, 18)]
    offcl = [0,0,0]
    seed = fxrand()*10000;
    horizon = fxrandom(0.24, 0.93);
    let sxx = fxrandom(0.05, 0.95);

    wind = fxrandom(-.4, +.4);
    if(fxrand() < .5)
        wind = 3.14 + wind;

    canvasWidth = ress;
    canvasHeight = ress;

    var ww = window.innerWidth || canvas.clientWidth || body.clientWidth;
    var wh = window.innerHeight|| canvas.clientHeight|| body.clientHeight;

    baseWidth = ress-33;
    baseHeight = ress-33;

    winScale = ww / baseWidth;

    if(ww < ress+16 || wh < ress+16 || true){
        var mm = min(ww, wh);
        canvasWidth = mm-33*mm/ress;
        canvasHeight = mm-33*mm/ress;
        //baseWidth = mm-16-16;
        //baseHeight = mm-16-16;
    }

    ww = canvasWidth
    wh = canvasHeight

    sunPos = [sxx, getHorizon(sxx*baseWidth)/baseHeight+fxrandom(-.0, .1)];
    sunSpread = fxrandom(1.85, 1.85);


    var hsv = [Math.pow(fxrand(), 2), fxrandom(0.2, 0.56), fxrandom(0.25, 0.35)]
    hsv[0] = fxrandom(0.5, 0.9)
    if(hsv[0] > 0.5){
        hsv[1] = fxrandom(0.2, 0.26)
    }
    if(sunPos[1] > horizon){
        hsv[2] = fxrandom(0.2, 0.56)
    }
    backgroundColor = HSVtoRGB(hsv[0], hsv[1], hsv[2])

    while(myDot(backgroundColor, [0,1,0]) > 0.5){
        hsv = [Math.pow(fxrand()*.5, 2), fxrandom(0.2, 0.36), fxrandom(0.35, 0.55)]
        backgroundColor = HSVtoRGB(hsv[0], hsv[1], hsv[2])
    }
    
    sunColor = HSVtoRGB(fxrandom(0, .026), fxrandom(0.9, .99), fxrandom(.8, 1.0));
    sunColor = [255.*sunColor[0], 255.*sunColor[1], 255.*sunColor[2]]
    //sunColor = [255.*Math.pow(backgroundColor[0], .35), 255.*Math.pow(backgroundColor[1], 2.3), 255.*Math.pow(backgroundColor[2], 2.3)]
    if((backgroundColor[0]+backgroundColor[1]+backgroundColor[2])/3 < .35){
        //sunColor = HSVtoRGB(fxrandom(0.4, .61), fxrandom(0.2, .34), fxrandom(.6, 1.0));
        //sunColor = [255.*sunColor[0], 255.*sunColor[1], 255.*sunColor[2]]
    }
    console.log("fas", sunPos[1]*baseHeight, getHorizon(sunPos[0]*baseWidth))

    /*if(ww/wh > 1){
        baseWidth = Math.round(ress * ww/wh)
        baseHeight = ress
    }
    else{
        baseWidth = ress
        baseHeight = Math.round(ress * wh/ww)
    }*/

    //groundclr.a[3] = 0;
    var rx, ry;
    var pixelData;
    rx = fxrand()*33+128;
    ry = fxrand()*33+128;
    pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    if(fxrand()<-1.5) groundclr.a = [pixelData[0], pixelData[1], pixelData[2], 255];
    rx += fxrand()*88-44;
    ry += fxrand()*88-44;
    pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    if(fxrand()<-1.5) groundclr.b = [pixelData[0], pixelData[1], pixelData[2], 255*(fxrand()<2.5)];
    rx += fxrand()*88-44;
    ry += fxrand()*88-44;
    pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    if(fxrand()<-1.5) groundclr.c = [pixelData[0], pixelData[1], pixelData[2], 255*(fxrand()<2.5)];

    rx += fxrand()*33-16;
    ry += fxrand()*33-16;
    pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    if(fxrand()<-1.5) skyclr.a = [pixelData[0], pixelData[1], pixelData[2], 255];
    rx += fxrand()*33-16;
    ry += fxrand()*33-16;
    pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    if(fxrand()<-1.5) skyclr.b = [pixelData[0], pixelData[1], pixelData[2], 188];
    rx += fxrand()*33-16;
    ry += fxrand()*33-16;
    pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    if(fxrand()<-1.5) skyclr.c = [pixelData[0], pixelData[1], pixelData[2], 188];
    
    rx += fxrand()*66-36;
    ry += fxrand()*66-36;
    pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    if(fxrand()<-1.5) treeclr.a = [pixelData[0], pixelData[1], pixelData[2], 255];
    rx += fxrand()*66-36;
    ry += fxrand()*66-36;
    pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    if(fxrand()<-1.5) treeclr.b = [pixelData[0], pixelData[1], pixelData[2], 188];
    rx += fxrand()*66-36;
    ry += fxrand()*66-36;
    pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    if(fxrand()<-1.5) treeclr.c = [pixelData[0], pixelData[1], pixelData[2], 255];

    //resizeCanvas(ww, wh, true);
    //pg = createGraphics(ww, wh);

    particlePositions = [];
    particleColors = [];
    particleSizes = [];
    particleAngles = [];
    particleIndices = [];

    generateBackground();
    generateForeground();
    //generateForeground();
    generateTrees();

    
    loadShadersAndData();

    

}

function loadShadersAndData(){
    
    //const material = new THREE.PointsMaterial( { size: 15, vertexColors: true } );
    var loader = new THREE.FileLoader();
    var numFilesLeft = 2;
    function runMoreIfDone() {
        --numFilesLeft;
        if (numFilesLeft === 0) {
            loadData();
        }
    }
    loader.load('./assets/shaders/particle.frag',function ( data ) {fShader =  data; runMoreIfDone(); },);
    loader.load('./assets/shaders/particle.vert',function ( data ) {vShader =  data; runMoreIfDone(); },);
}

function loadData(){
    /*
    canvas2 = document.createElement("canvas");
    canvas2.id = "hello"
    canvas2.width = ww;
    canvas2.height = wh;
    canvas2.style.position = 'absolute';
    canvas2.style.left = '0px';
    canvas2.style.top = '0px';
    canvas2.style.z_index = '1111';
    console.log(canvas2)
    document.body.append(canvas2)
    */
    winScale = canvasWidth / ress;
    camera = new THREE.OrthographicCamera(-canvasWidth/2/winScale, canvasWidth/2/winScale, canvasHeight/2/winScale, -canvasHeight/2/winScale, 1, 2000);
    //camera = new THREE.OrthographicCamera( 1000 * 1. / - 2, 1000 * 1. / 2, 1000 / 2, 1000 / - 2, 1, 4000 );
    //camera = new THREE.PerspectiveCamera( 27, canvasWidth / canvasHeight, 5, 3500 );
    camera.position.z = 1000;

    var ff = true;
    if(scene)
        ff = false;
    scene = new THREE.Scene();


    var rx = fxrand()*256;
    var ry = fxrand()*256;
    var pixelData = paletteCanvas.getContext('2d').getImageData(rx, ry, 1, 1).data;
    //backgroundColor = [pixelData[0]/255., pixelData[1]/255., pixelData[2]/255.];

    scene.background = new THREE.Color( backgroundColor[0], backgroundColor[1], backgroundColor[2]);
    //scene.fog = new THREE.Fog( 0x050505, 2000, 3500 );

    //

    const particles = 33133;


    const pointsGeo = new THREE.BufferGeometry();

    pointsGeo.setAttribute( 'position', new THREE.Float32BufferAttribute( particlePositions, 3 ) );
    pointsGeo.setAttribute( 'color', new THREE.Float32BufferAttribute( particleColors, 4 ) );
    pointsGeo.setAttribute( 'size', new THREE.Float32BufferAttribute( particleSizes, 2 ) );
    pointsGeo.setAttribute( 'angle', new THREE.Float32BufferAttribute( particleAngles, 1 ) );
    pointsGeo.setAttribute( 'index', new THREE.Float32BufferAttribute( particleIndices, 1 ) );

    var customUniforms = {
        u_time: { value: frameCount },
        u_scrollscale: { value: scrollscale },
        u_winscale: { value: 4. },
    };


    const material = new THREE.ShaderMaterial( {
        uniforms: customUniforms,
        vertexShader: vShader,
        fragmentShader: fShader,
        transparent:  true
      });

      //console.log(vShader);

    points = new THREE.Points( pointsGeo, material );
    scene.add( points );
    const sphereGeo = new THREE.BoxGeometry( 133,133,133);
    const sphereMat = new THREE.MeshBasicMaterial( { color: 0xbbbbbb } );
    const sphere = new THREE.Mesh( sphereGeo, sphereMat );
    sphere.rotation.x = fxrand();
    sphere.rotation.y = fxrand();
    sphere.rotation.z = fxrand();
    //scene.add( sphere );
    //

    if(ff)
        renderer = new THREE.WebGLRenderer({alpha: true});
    //renderer.setPixelRatio( 1.0 );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( canvasWidth, canvasHeight );

    renderer.domElement.id = "cnvs"
    //renderer.domElement.style.position = "absolute";
    //renderer.domElement.style.left = "0px";
    //renderer.domElement.style.top = "0px";
    if(ff)
        document.body.appendChild( renderer.domElement );

    repositionCanvas(renderer.domElement);

    if(canvasWidth < canvasHeight || canvasWidth < ress || canvasHeight < ress)
      renderer.domElement.style.borderWidth = "0px";
    else
        renderer.domElement.style.borderWidth = "0px";


    points.material.uniforms.u_time.value = 0;
    points.material.uniforms.u_scrollscale.value = scrollscale;
    points.material.uniforms.u_winscale.value = winScale*window.devicePixelRatio;
    const composer = new EffectComposer( renderer );
    const renderPass = new RenderPass( scene, camera );
    PostProcShader.uniforms.resolution.value = [canvasWidth*window.devicePixelRatio, canvasHeight*window.devicePixelRatio];
    const luminosityPass = new ShaderPass( PostProcShader );
    composer.addPass( renderPass );
    composer.addPass( luminosityPass );
    composer.render();
    //renderer.render( scene, camera );
    fxpreview();
    console.log('hash:', fxhash);
    //window.addEventListener( 'resize', onWindowResize );
}


function repositionCanvas(canvas){
    var win = window;
    var doc = document;
    var body = doc.getElementsByTagName('body')[0];
    var ww = win.innerWidth;
    var wh = win.innerHeight;
    
    if(isMobile()){
      //canvas.width = ww;
      //canvas.height = wh;
      //canvas.style.borderWidth = "6px";
    }
    else{
      //canvas.width = Math.min(ww, wh) - 130;
      //canvas.height = Math.min(ww, wh) - 130;
    }

    canvas.style.position = 'absolute';
    canvas.style.left = (ww - canvasWidth)/2 + 'px';
    canvas.style.top = (wh - canvasHeight)/2 + 'px'; // ovih 6 je border
    
}

var cnt = 0

var shft = fxrandom(0.6, 1.05)%1.0;
var shft2 = fxrandom(0.0, 1.0)%1.0;

function drawTree(rx, ry, kk, pp){
    
    //pg.noStroke();
    //pg.fill(255);
    //pg.ellipse(rx, ry, 40, 40);
    var perspective = map(ry, getHorizon(rx), baseHeight, 0.5, 0.8);
    var perspective2 = map(ry, getHorizon(rx), baseHeight, 0.1, 0.6);
    var perspective3 = map(ry, 0, baseHeight, 0.0, 1.0);
    if(perspective3 < .25){
        perspective3 = 0;
    }
    else{
        perspective3 = 1;
    }
    //perspective = 1;

    var seed1 = fxrandom(0, 100000);
    var detail = fxrandom(5, 8)*.45;
    var amp = 133;
    var frq = 0.0002;
    var pscale = map(ry, getHorizon(rx), baseHeight, 0.1, 1.0);
    var fade = map(ry, baseHeight*horizon*1.0, baseHeight, 0.88, 1.0);
    var maxwidth = 20;
    var startroot = fxrandom(0.92, 0.95);
    var rootmax = fxrandom(0.9, 2.2);

    var pos, col, size, angle;

    var offcl2 = [fxrandom(-25,+9), fxrandom(-15,+14), fxrandom(-25,+9)]
    //pg.fill(map(ry, baseHeight*horizon*1.0, baseHeight, 222, 255));
    var coco = 0;
    for(var y = ry; y > 0; y -= detail*perspective){
        var rootwide0 = constrain(map(y, ry, ry*startroot, 1, 0), 0, 1);
        //rootwide = .8+.8*Math.pow(noise(rx, ry, y*.01), 3) + rootmax*Math.pow(rootwide, 4);
        var rootwide = 1 + rootmax*Math.pow(rootwide0, 4);
        for(var x = rx - pscale*maxwidth*rootwide; x < rx + pscale*maxwidth*rootwide; x += max(1, 4*perspective)){
            var xx = x + perspective3*map(y, ry, 0, 0, 1)*amp*(-.5 + power(noise(rx*frq, y*frq, seed1), 2)) + fxrandom(-detail,detail)*1.7*(.4 + .6*Math.pow(1.-perspective2, 4));
            var yy = y + fxrandom(-detail,detail)*1.9 + 40*Math.pow(noise(x*0.04, y*0.04), 4)*rootwide0;
            col = [
                offcl2[0] + offcl[0] + fade*treeclr.c[0]*1.12 + fxrandom(-treeclr.cd[0], treeclr.cd[0]),
                offcl2[1] + offcl[1] + fade*treeclr.c[1] + fxrandom(-treeclr.cd[1], treeclr.cd[1]),
                offcl2[2] + offcl[2] + fade*treeclr.c[2] + fxrandom(-treeclr.cd[2], treeclr.cd[2]),
                treeclr.c[3]*.6 + fxrandom(-treeclr.cd[3], treeclr.cd[3]),
            ];
            
            pos = [xx, yy];
            if(noise(xx*0.05, yy*0.004) + map(ry, baseHeight*horizon*1.0, baseHeight, -.2, .2) < 0.05+fxrandom(-.4,.4)+y/baseHeight){
                if(sunPos[1]*baseHeight > baseHeight*.15+ getHorizon(sunPos[0]*baseWidth)){
                    col = [
                        offcl2[0] + offcl[0] + fade*treeclr.a[0]*.8 + fxrandom(-treeclr.ad[0], treeclr.ad[0]),
                        offcl2[1] + offcl[1] + fade*treeclr.a[1] + fxrandom(-treeclr.ad[1], treeclr.ad[1]),
                        offcl2[2] + offcl[2] + fade*treeclr.a[2] + fxrandom(-treeclr.ad[2], treeclr.ad[2]),
                        treeclr.a[3] + fxrandom(-treeclr.ad[3], treeclr.ad[3]),
                    ];
                }
                else{
                    col = [
                        offcl2[0] + offcl[0] + fade*treeclr.e[0] + fxrandom(-treeclr.ed[0], treeclr.ed[0]),
                        offcl2[1] + offcl[1] + fade*treeclr.e[1] + fxrandom(-treeclr.ed[1], treeclr.ed[1]),
                        offcl2[2] + offcl[2] + fade*treeclr.e[2] + fxrandom(-treeclr.ed[2], treeclr.ed[2]),
                        treeclr.e[3] + fxrandom(-treeclr.ed[3], treeclr.ed[3]),
                    ];

                }
                if(kk%10==319){
                    //col[0] = fxrandom(190, 250);
                    //col[1] = col[0];
                    //col[2] = col[0];
                    let h2r = HSVtoRGB(
                        (.98+.04*noise(xx*0.05+22.55, yy*0.004))%1.0+0*fxrandom(-.01,.01),
                        fxrandom(.4, .7), 
                        .35+.3*noise(xx*0.05+31.13, yy*0.004)+fxrandom(-.1,.1)+0.1,
                        );
                    //col = [h2r[0]*255., h2r[1]*255., h2r[2]*255., skyclr.c[3]*.6 + fxrandom(-treeclr.bd[3], treeclr.bd[3]),];
                }
            }
            else{
                    
                if(sunPos[1] < horizon+.1 && false){
                    var dir = [pos[0]-sunPos[0], pos[1]-sunPos[1]];
                    var ll = Math.sqrt(dir[0]*dir[0]+dir[1]*dir[1])
                    dir[0] /= ll;
                    dir[1] /= ll;
                    var sc = fxrandom(-11, 222);
                    var ang = Math.atan2(dir[1], dir[0]);
                    ang = Math.round(ang*10)/.1;
                    dir[0] = Math.cos(ang);
                    dir[1] = Math.sin(ang);
                    dir[0] *= sc;
                    dir[1] *= sc;
                    pos[0] += dir[0];
                    pos[1] += dir[1];
                    col[0] = 222;
                    col[1] = 166;
                    col[2] = 133;
                    col[3] = 55;
                }  

                if(sunPos[1]*baseHeight > baseHeight*.15+ getHorizon(sunPos[0]*baseWidth)){
                    col = [
                        offcl2[0] + offcl[0] + fade*treeclr.a[0]*.8 + fxrandom(-treeclr.ad[0], treeclr.ad[0]),
                        offcl2[1] + offcl[1] + fade*treeclr.a[1] + fxrandom(-treeclr.ad[1], treeclr.ad[1]),
                        offcl2[2] + offcl[2] + fade*treeclr.a[2] + fxrandom(-treeclr.ad[2], treeclr.ad[2]),
                        treeclr.a[3] + fxrandom(-treeclr.ad[3], treeclr.ad[3]),
                    ];
                }
                else{
                    col = [
                        offcl2[0] + offcl[0] + fade*treeclr.c[0] + fxrandom(-treeclr.cd[0], treeclr.cd[0]),
                        offcl2[1] + offcl[1] + fade*treeclr.c[1] + fxrandom(-treeclr.cd[1], treeclr.cd[1]),
                        offcl2[2] + offcl[2] + fade*treeclr.c[2] + fxrandom(-treeclr.cd[2], treeclr.cd[2]),
                        treeclr.c[3] + fxrandom(-treeclr.cd[3], treeclr.cd[3]),
                    ];

                }
                
                if(noise(xx*0.05, yy*0.004) + map(ry, baseHeight*horizon*1.0, baseHeight, -.2, .2) < 0.5+fxrandom(-.1,.1)){
                    //col = [
                    //    offcl2[0] + offcl[0] + fade*treeclr.c[0] + fxrandom(-treeclr.cd[0], treeclr.cd[0]),
                    //    offcl2[1] + offcl[1] + fade*treeclr.c[1] + fxrandom(-treeclr.cd[1], treeclr.cd[1]),
                    //    offcl2[2] + offcl[2] + fade*treeclr.c[2] + fxrandom(-treeclr.cd[2], treeclr.cd[2]),
                    //    treeclr.c[3]*.6 + fxrandom(-treeclr.cd[3], treeclr.cd[3]),
                    //];
                }
            }
            angle = radians(fxrandom(-16,16));
            if(fxrand() > 0.97){
                var rb = fxrandom(110,255);
                col = [rb, rb, rb, fxrandom(0,88)];
                var ww = 10*pscale*fxrandom(.9, 1.1);
                size = [0, 0];
                if(xx-ww > rx - pscale*maxwidth*rootwide && xx+ww < rx + pscale*maxwidth*rootwide)
                    size = [5, 5];
            }
            else{
                size = [5.15*fxrandom(.8, 1.2)*perspective, 5*fxrandom(.9, 1.1)*perspective];
                //mySquare(0, 0, 6.5*fxrandom(.8, 1.2)*perspective, 4*fxrandom(.9, 1.1)*perspective);
            }
            coco++;
            //cnt++;
            if(pos[0] < 0 || pos[0] > baseWidth)
                continue
            if(pos[1] < 0 || pos[1] > baseHeight)
                continue

            if(kk == 13)
            {
                //col[0] = 244;
                //col[1] = 244;
                //col[2] = 244;
                //console.log(pos)
                //pos[0] = pos[1]%baseWidth
                //pos[1] = getHorizon(pos[0])
                //pos[0] = rx
                //pos[1] = ry
                //size[0] *= 10;
                //size[1] *= 10;
            }

            pos[0] = pos[0] - canvasWidth/2*0 - baseWidth/2;
            pos[1] = pos[1] - canvasHeight/2*0 - baseHeight/2;
            pos[1] *= -1;


            particlePositions.push(pos[0], pos[1], 0);
            particleColors.push(col[0]/255., col[1]/255., col[2]/255., col[3]/255.);
            //particleColors.push(Math.pow(1.-perspective2, 2), Math.pow(1.-perspective2, 2), Math.pow(1.-perspective2, 2), col[3]/255.);
            particleSizes.push(size[0], size[1]);
            particleAngles.push(angle);
            particleIndices.push(globalIndex++);

            
            if(fxrandom(0,1)>0.19){
                //drawHole(xx, yy, 25, 25);
            }
        }
    }
}

function generateTrees(){

    //console.log(sunPos, horizon)
    if(fxrand() < 1.36){
        var kk = 0;
        var nn = Math.floor(fxrandom(100, 150)*2);
        var bareGroundSpread = fxrandom(0.1, 0.3);
        nn = (1. - bareGroundSpread)*fxrandom(122, 128);
        var middle = fxrandom(.4, .6);
        while(kk < nn){

            var rx = fxrand();
            while(rx > middle-bareGroundSpread && rx < middle+bareGroundSpread){
                rx = fxrand();
            }

            //if(rx < .5)
            //    console.log(kk)

            var pp = map(kk, 0, nn, 0.03, 1);
            pp = Math.pow(pp, 12);
            var x = map(rx, 0, 1, 0, baseWidth);
            var y = map(pp, 0, 1, getHorizon(x)*1, baseHeight) + 0*fxrandom(0, baseHeight/30);
            drawTree(x, y, kk, pp);
            kk++;
        }
    }
    else{
        // Standard
        var kk = 0;
        var nn = Math.floor(fxrandom(5, 50));
        var ex = 4;
        treeGroundSpread = fxrandom(0.1, 0.35);
        nn = treeGroundSpread*100 * fxrandom(1.0, 4.3);
        var middle = fxrandom(treeGroundSpread, 1.-treeGroundSpread);
        treeGroundSpread = fxrandom(0.1, 0.35);
        if(fxrand() < 1.5){
            nn = Math.floor(fxrandom(50, 200));
            middle = 0.5;
            treeGroundSpread = fxrandom(.38, .5);
        }
        while(kk < nn){
            var pp = map(kk, 0, nn, 0.03, 1);
            pp = Math.pow(pp, 12);
            //var x = fxrandom(0, baseWidth);
            //var y = map(pp, 0, 1, getHorizon(x)*1.1, baseHeight) + 0*fxrandom(0, baseHeight/30);
    
            var randomx = middle + fxrandom(-treeGroundSpread, +treeGroundSpread);
            //if(fxrand() > prob)
            //    continue;
            var x = map(randomx, 0, 1, 0, baseWidth);
            var y = map(pp, 0, 1, getHorizon(x)*1, baseHeight) + 0*fxrandom(0, baseHeight/30);
            drawTree(x, y, kk, pp);
            kk++;
        }
    }
}

function drawHole(x, y, lx, rx){
    for(var k = 0; k < 1230; k++){
        var dx = fxrandom(20, 30)*.4;
        var dy = fxrandom(5, 13)*.5;
        var xx = x + fxrandom(-80, 80);
        var yy = y + fxrandom(-88, 84);
        if(dist(x*1, y*1, xx*1, yy*1) < 86 && xx-dx/2 > lx && xx+dx/2 < rx){
            //pg.push();
            //pg.translate(xx, yy);
            //pg.rotate(radians(fxrandom(-16,16)));
            //pg.fill(fxrandom(0, 255), fxrandom(0, 88));
            //mySquare(0, 0, dx, dy);
            //pg.pop();
            var pos = [xx, yy];
            var rc = fxrandom(0, 255);
            var col = [rc, rc, rc, fxrandom(0, 188)];
            var size = [dx, dy];
            var angle = 0;
            
            pos[0] = pos[0] - canvasWidth/2*0 - baseWidth/2;
            pos[1] = pos[1] - canvasHeight/2*0 - baseHeight/2;
            pos[1] *= -1;

            particlePositions.push(pos[0], pos[1], 0);
            particleColors.push(col[0]/255., col[1]/255., col[2]/255., col[3]/255.);
            particleSizes.push(size[0], size[1]);
            particleAngles.push(angle);
            particleIndices.push(globalIndex++);
        }
    }
}

function HSVtoRGB(h, s, v) {
    var r, g, b, i, f, p, q, t;
    if (arguments.length === 1) {
        s = h.s, v = h.v, h = h.h;
    }
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return [r, g, b]
}

function myDot(col1, col2){
    let dd = Math.sqrt(col1[0]*col1[0]+col1[1]*col1[1]+col1[2]*col1[2]);
    let r = col1[0]/dd;
    let g = col1[1]/dd;
    let b = col1[2]/dd;
    let dd2 = Math.sqrt(col2[0]*col2[0]+col2[1]*col2[1]+col2[2]*col2[2]);
    let r2 = col2[0]/dd2;
    let g2 = col2[1]/dd2;
    let b2 = col2[2]/dd2;
    return r*r2 + g*g2 + b*b2;
}

function generateBackground(){
    var hsv = [fxrand(), fxrandom(0.2, 0.66), fxrandom(0.3, 0.95)]
    var rgb = HSVtoRGB(hsv[0], hsv[1], hsv[2])

    var offcl1 = [fxrandom(-33, 33), fxrandom(-33, 17), fxrandom(-77, 5)]
    var offcl2 = offcl1

    for(var k = 0; k < 230000*horizon; k++){
        var x = fxrandom(0, baseWidth);
        var gg = map(power(constrain(fxrand(), 0, 1), 1), 0, 1, .5, 3);
        var y = Math.pow(fxrand(), .7);
        y = y*getHorizon(x) + fxrandom(-5, 5);
        var pos, col, size, angle;
        col = [-1,-1,-1,-1]

        var coliters = 0;
        while(( coliters==0 || myDot(col, [0, 1, 0]) > 0.7 || myDot(col, [1, 1, 0]) > 0.75 || myDot(col, [1, 0, 1]) > 0.7) && coliters < 10){
            coliters++;
            if(fxrandom(0,1000) > 980){
                col = [
                    offcl2[0] + skyclr.b[0] + fxrandom(-skyclr.bd[0], skyclr.bd[0]),
                    offcl2[1] + skyclr.b[1] + fxrandom(-skyclr.bd[1], skyclr.bd[1]),
                    offcl2[2] + skyclr.b[2] + fxrandom(-skyclr.bd[2], skyclr.bd[2]),
                    skyclr.b[3]*.5 + fxrandom(-skyclr.bd[3], skyclr.bd[3]),
                ];
                //pg.push();
                //pg.translate(x, y);
                pos = [x, y];
                size = [fxrandom(5, 10)*1.7*.35, fxrandom(5, 10)*.9*.35];
                angle = radians(-20 + 40*noise(x*0.01, y*0.01))+wind;
                //mySquare(0, 0, fxrandom(5, 10)*2.7*.35, fxrandom(5, 10)*.9*.35);
                //pg.pop();
            }
            else if(fxrand() > 0.998){
                var rc = fxrandom(0, 255);
                col = [rc, rc, rc, fxrandom(140, 190)];
                angle = radians(-20 + 40*noise(x*0.01, y*0.01)) + wind*.15;
                size = [fxrandom(10,20)*.12, fxrandom(10,20)*.12];
                //mySquare(0, 0, fxrandom(10,20)*.2*perspective, fxrandom(10,20)*.3*perspective);
            }
            else{
                if(fxrand() < map(y, 0, baseHeight*horizon, 0, 1)){
                //if(map(y, 0, baseHeight*horizon, 0, 1) + fxrandom(-.22, .22) + .45*(-.5+power(noise(x*.006+1351.31, y*.006+33.31), 3)) < .35){
                    col = [
                        offcl1[0] + skyclr.a[0] + fxrandom(-skyclr.ad[0], skyclr.ad[0]),
                        offcl1[1] + skyclr.a[1] + fxrandom(-skyclr.ad[1], skyclr.ad[1]),
                        offcl1[2] + skyclr.a[2] + fxrandom(-skyclr.ad[2], skyclr.ad[2]),
                        skyclr.a[3]*.85 + fxrandom(-skyclr.ad[3], skyclr.ad[3]),
                    ];
                    //col = [244, 244, 244, 255];
                    let h2r = HSVtoRGB(
                        shft2,
                        fxrandom(.2, .3)*1, 
                        fxrandom(.5, .67)*.7,
                        //.35+.3*noise(xx*0.05+31.13, yy*0.004)+fxrandom(-.1,.1)+0.1,
                        );
                    //col = [h2r[0]*255.+fxrandom(-30,30), h2r[1]*255.+fxrandom(-30,30), h2r[2]*255.+fxrandom(-30,30), skyclr.a[3]*.85 + fxrandom(-skyclr.ad[3], skyclr.ad[3]),];
                }
                else{
                    col = [
                        offcl1[0] + skyclr.c[0] + fxrandom(-skyclr.cd[0], skyclr.cd[0]),
                        offcl1[1] + skyclr.c[1] + fxrandom(-skyclr.cd[1], skyclr.cd[1]),
                        offcl1[2] + skyclr.c[2] + fxrandom(-skyclr.cd[2], skyclr.cd[2]),
                        skyclr.c[3]*.85 + fxrandom(-skyclr.cd[3], skyclr.cd[3]),
                    ];
                    //col = [244, 244, 244, 255];
                    let h2r = HSVtoRGB(
                        shft,
                        fxrandom(.2, .3)*1, 
                        fxrandom(.6, .7)*.7,
                        //.35+.3*noise(xx*0.05+31.13, yy*0.004)+fxrandom(-.1,.1)+0.1,
                        );
                    //.col = [h2r[0]*255.+fxrandom(-30,30), h2r[1]*255.+fxrandom(-30,30), h2r[2]*255.+fxrandom(-30,30), skyclr.a[3]*.85 + fxrandom(-skyclr.ad[3], skyclr.ad[3]),];
                }

                pos = [x, y];
                
                var dx = fxrandom(2, 10)*.215;
                size = [dx, dx*(1 + fxrandom(1.5, 1.8))];
                //size = [fxrandom(2, 10)*.315, fxrandom(2, 10)*.35];

                //mySquare(0, 0, fxrandom(5, 10)*.35, fxrandom(5, 10)*.35);
                //pg.pop(); 
                // SUN
                let sup = [sunPos[0]*baseWidth + fxrandom(-30, 30), sunPos[1]*baseHeight + fxrandom(-77, 77)];
                var dd = Math.sqrt((x-sup[0])*(x-sup[0])+(y-sup[1])*(y-sup[1])) / Math.sqrt(sup[0]*sup[0]+sup[1]*sup[1])
                //dd = dd * map(noise(x*0.005, y*0.005, 831.31), 0, 1, .6, 2);
                dd = min(dd*sunSpread, 1.0);
                //col[0] = 255;
                //col[1] = 255;
                //col[2] = 255;
                angle = radians(-20 + 40*noise(x*0.01, y*0.01))+wind + fxrandom(-.1, .1);
                if(1-dd>.5 && fxrand() > .6){
                    //angle = angle + (-Math.atan2(sunPos[1]*baseWidth - y, sunPos[0]*baseWidth - x) - angle);
                }

                if((backgroundColor[0]+backgroundColor[1]+backgroundColor[2])/3 > -.35){
                    col[0] = sunColor[0]*(1-dd)*(.5 + .5*sunPos[1])+dd*col[0];
                    col[1] = sunColor[1]*(1-dd)*(2-sunPos[1])+dd*col[1];
                    col[2] = sunColor[2]*(1-dd)*(2-sunPos[1])+dd*col[2];
                    col[3] = 127;

                }
            }
        }


        if(pos[0] < 0 || pos[0] > baseWidth)
            continue
        if(pos[1] < 0 || pos[1] > baseHeight)
            continue
        pos[0] = pos[0] - canvasWidth/2*0 - baseWidth/2;
        pos[1] = pos[1] - canvasHeight/2*0 - baseHeight/2;
        pos[1] *= -1;

        particlePositions.push(pos[0], pos[1], 0);
        particleColors.push(col[0]/255., col[1]/255., col[2]/255., col[3]/255.);
        particleSizes.push(size[0], size[1]);
        particleAngles.push(angle);
        particleIndices.push(globalIndex++);
    }
}

function generateForeground(){
    //rect(baseDim/2, baseDim*1.8, baseDim*2, baseDim*2);
    //var detail = 3;
    var amp = min(baseWidth, baseHeight)/10;
    var frq = 0.002;
    //pg.fill(
    //    groundclr.a[0] + fxrandom(-groundclr.ad[0], groundclr.ad[0]),
    //    groundclr.a[1] + fxrandom(-groundclr.ad[1], groundclr.ad[1]),
    //    groundclr.a[2] + fxrandom(-groundclr.ad[2], groundclr.ad[2]),
    //    groundclr.a[3] + fxrandom(-groundclr.ad[3], groundclr.ad[3]),
    //);
    //pg.noStroke();
    //pg.rect(baseWidth/2, baseHeight*(1+horizon*1.1)/2, baseWidth, baseHeight*(1-horizon));
    var offcl1 = [fxrandom(-33, 34), fxrandom(-5, 34), fxrandom(-34, 14)]
    var offcl2 = [fxrandom(-14, 14), fxrandom(-14, 14), fxrandom(-14, 14)]
    var rr1 = fxrandom(0.25, 0.5); // .4155
    var rr2 = fxrandom(rr1, rr1+0.35) // .565
    var dispr = fxrandom(0.03, 0.09)

    for(var k = 0; k < 290000*(1-horizon); k++){
        var x = fxrandom(0, baseWidth);
        var y = fxrandom(getHorizon(x), baseHeight*1.0);

        var pos, col, size, angle;
//for(var x = 0; x < baseDim; x += detail){
//    for(var y = baseHeight*horizon; y < baseDim*1.1; y += detail){
        var perspective = map(y, getHorizon(x), baseHeight*1.0, .6, 1);

        rr1 = map(noise(x*0.01, y*0.01+241.2141), 0, 1, 0.25, 0.5);
        rr2 = map(noise(x*0.01, y*0.01+33.44), 0, 1, rr1, rr1+0.35);
        dispr = map(noise(x*0.01, y*0.01+55.55), 0, 1, 0.03, 0.13);
        var xx = x;
        var frqx = map(power(noise(xx*0.001, y*0.001, 22.555), 1), 0, 1, 0.3, 2);
        var frqy = frqx;
        frqx = frqy = .5;
        //var frqy = map(power(noise(xx*0.001, y*0.001, 313.31314), 1), 0, 1, 0.3, 2);
        var yy = y + 0*amp*(-power(noise(x*frq, y*frq), 2)) + fxrandom(-5,5);

        pos = [xx, yy];
        col = [
            offcl2[0] + groundclr.a[0] + fxrandom(-groundclr.ad[0], groundclr.ad[0]),
            offcl2[1] + groundclr.a[1] + fxrandom(-groundclr.ad[1], groundclr.ad[1]),
            offcl2[2] + groundclr.a[2] + fxrandom(-groundclr.ad[2], groundclr.ad[2]),
           groundclr.a[3]*.85 + fxrandom(-groundclr.ad[3], groundclr.ad[3]),
        ];
        if(fxrand() > 0.998){
            var rc = fxrandom(0, 255);
            col = [rc, rc, rc, fxrandom(140, 190)];
            angle = radians(-20 + 40*noise(x*0.01, y*0.01)) + wind*.15;
            size = [fxrandom(10,20)*.2*perspective, fxrandom(10,20)*.3*perspective];
            //mySquare(0, 0, fxrandom(10,20)*.2*perspective, fxrandom(10,20)*.3*perspective);
        }
        else{
            if(fxrandom(0,1000) > 960 || noise(xx*0.004*frqx, yy*0.02*frqy)+dispr*fxrandom(-1,1) < rr1 && fxrand()>0.4)
                col = [
                    offcl2[0] + groundclr.c[0] + fxrandom(-groundclr.cd[0], groundclr.cd[0]),
                    offcl2[1] + groundclr.c[1] + fxrandom(-groundclr.cd[1], groundclr.cd[1]),
                    offcl2[2] + groundclr.c[2] + fxrandom(-groundclr.cd[2], groundclr.cd[2]),
                    groundclr.c[3]*0 + fxrandom(-groundclr.cd[3], groundclr.cd[3]),
                ];
                else if(fxrandom(0,1000) > 960 || noise(xx*0.004*frqx, yy*0.02*frqy)+dispr*fxrandom(-1,1) < rr2 && fxrand()>0.4)
                    col = [
                        offcl1[0] + groundclr.b[0] + fxrandom(-groundclr.bd[0], groundclr.bd[0]),
                        offcl1[1] + groundclr.b[1] + fxrandom(-groundclr.bd[1], groundclr.bd[1]),
                        offcl1[2] + groundclr.b[2] + fxrandom(-groundclr.bd[2], groundclr.bd[2]),
                        groundclr.b[3] + fxrandom(-groundclr.bd[3], groundclr.bd[3]),
                    ];
            var dx = fxrandom(5, 10)*.25*perspective;
            size = [dx, dx*(1 + fxrandom(1.5, 1.8))];
            angle = radians(-20 + 40*noise(x*0.01, y*0.01)) + wind*.15 + fxrandom(-.1, .1);
            //mySquare(0, 0, fxrandom(5, 10)*.35*perspective, fxrandom(5, 10)*.35*perspective);
        }

        if(pos[0] < 0 || pos[0] > baseWidth)
            continue
        if(pos[1] < 0 || pos[1] > baseHeight)
            continue
        pos[0] = pos[0] - canvasWidth/2*0 - baseWidth/2;
        pos[1] = pos[1] - canvasHeight/2*0 - baseHeight/2;
        pos[1] *= -1;

        particlePositions.push(pos[0], pos[1], 0);
        particleColors.push(col[0]/255., col[1]/255., col[2]/255., col[3]/255.);
        particleSizes.push(size[0], size[1]);
        particleAngles.push(angle);
        particleIndices.push(globalIndex++);
    // }
    }
}

function windowResized() {
    if(renderer){

        var ww = window.innerWidth || canvas.clientWidth || body.clientWidth;
        var wh = window.innerHeight|| canvas.clientHeight|| body.clientHeight;

        baseWidth = ress-33;
        baseHeight = ress-33;

        canvasWidth = ress;
        canvasHeight = ress;

        if(ww < ress+16 || wh < ress+16 || true){
            var mm = min(ww, wh);
            canvasWidth = mm-10*mm/ress;
            canvasHeight = mm-10*mm/ress;
            //baseWidth = mm-16-16;
            //baseHeight = mm-16-16;
        }

        winScale = canvasWidth / ress;
        camera.left = -canvasWidth/2 / winScale;
        camera.right = +canvasWidth/2 / winScale;
        camera.top = +canvasHeight/2 / winScale;
        camera.bottom = -canvasHeight/2 / winScale;
        camera.updateProjectionMatrix();

        renderer.setPixelRatio( window.devicePixelRatio );
        //renderer.setPixelRatio( 1.0000 );
        renderer.setSize( canvasWidth, canvasHeight );
    
        renderer.domElement.id = "cnvs";
        //renderer.domElement.style.position = "absolute";
        //renderer.domElement.style.left = "0px";
        //renderer.domElement.style.top = "0px";
        repositionCanvas(renderer.domElement);

    
        points.material.uniforms.u_time.value = 0;
        points.material.uniforms.u_scrollscale.value = scrollscale;
        //console.log(winScale);
        points.material.uniforms.u_winscale.value = winScale*window.devicePixelRatio;

        const composer = new EffectComposer( renderer );
        const renderPass = new RenderPass( scene, camera );
        PostProcShader.uniforms.resolution.value = [canvasWidth*window.devicePixelRatio, canvasHeight*window.devicePixelRatio];
        const luminosityPass = new ShaderPass( PostProcShader );
        composer.addPass( renderPass );
        composer.addPass( luminosityPass );
        composer.render();
        //renderer.render( scene, camera );
    }
    else{
        reset();
    }
}  

function mouseClicked(){
    //reset();
}

function scroll(event) {
    //event.preventDefault();
    //scrollscale = scrollscale + event.deltaY * -0.002;
    //scrollscale = Math.min(Math.max(.125, scrollscale), 6);
  }
  
  
window.onresize = windowResized;
window.onresize = windowResized;
window.onclick = mouseClicked;
window.onwheel = scroll;

var paletteImg = new Image();
paletteImg.src = './assets/colorPalette2.png';
paletteImg.onload = function () {
    paletteCanvas = document.createElement('canvas');
    paletteCanvas.width = paletteImg.width;
    paletteCanvas.height = paletteImg.height;
    paletteCanvas.getContext('2d').drawImage(paletteImg, 0, 0, paletteImg.width, paletteImg.height);
    reset();
}

const PERLIN_YWRAPB = 4;
const PERLIN_YWRAP = 1 << PERLIN_YWRAPB;
const PERLIN_ZWRAPB = 8;
const PERLIN_ZWRAP = 1 << PERLIN_ZWRAPB;
const PERLIN_SIZE = 4095;

let perlin_octaves = 4; 
let perlin_amp_falloff = 0.5; 

const scaled_cosine = i => 0.5 * (1.0 - Math.cos(i * Math.PI));
let perlin;


var noise = function(x, y = 0, z = 0) {
  if (perlin == null) {
    perlin = new Array(PERLIN_SIZE + 1);
    for (let i = 0; i < PERLIN_SIZE + 1; i++) {
      perlin[i] = fxrand();
    }
  }

  if (x < 0) {
    x = -x;
  }
  if (y < 0) {
    y = -y;
  }
  if (z < 0) {
    z = -z;
  }

  let xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z);
  let xf = x - xi;
  let yf = y - yi;
  let zf = z - zi;
  let rxf, ryf;

  let r = 0;
  let ampl = 0.5;

  let n1, n2, n3;

  for (let o = 0; o < perlin_octaves; o++) {
    let of = xi + (yi << PERLIN_YWRAPB) + (zi << PERLIN_ZWRAPB);

    rxf = scaled_cosine(xf);
    ryf = scaled_cosine(yf);

    n1 = perlin[of & PERLIN_SIZE];
    n1 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n1);
    n2 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
    n2 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n2);
    n1 += ryf * (n2 - n1);

    of += PERLIN_ZWRAP;
    n2 = perlin[of & PERLIN_SIZE];
    n2 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n2);
    n3 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
    n3 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n3);
    n2 += ryf * (n3 - n2);

    n1 += scaled_cosine(zf) * (n2 - n1);

    r += n1 * ampl;
    ampl *= perlin_amp_falloff;
    xi <<= 1;
    xf *= 2;
    yi <<= 1;
    yf *= 2;
    zi <<= 1;
    zf *= 2;

    if (xf >= 1.0) {
      xi++;
      xf--;
    }
    if (yf >= 1.0) {
      yi++;
      yf--;
    }
    if (zf >= 1.0) {
      zi++;
      zf--;
    }
  }
  return r;
};

var noiseDetail = function(lod, falloff) {
  if (lod > 0) {
    perlin_octaves = lod;
  }
  if (falloff > 0) {
    perlin_amp_falloff = falloff;
  }
};

var noiseSeed = function(seed) {
  const lcg = (() => {
    const m = 4294967296;
    const a = 1664525;
    const c = 1013904223;
    let seed, z;
    return {
      setSeed(val) {
        z = seed = (val == null ? fxrand() * m : val) >>> 0;
      },
      getSeed() {
        return seed;
      },
      rand() {
        z = (a * z + c) % m;
        return z / m;
      }
    };
  })();

  lcg.setSeed(seed);
  perlin = new Array(PERLIN_SIZE + 1);
  for (let i = 0; i < PERLIN_SIZE + 1; i++) {
    perlin[i] = lcg.rand();
  }
};