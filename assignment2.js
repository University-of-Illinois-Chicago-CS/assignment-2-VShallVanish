//Author: Vansh "V" Mattraa
//Starter code provided by: Professor Khairi Reda
//Fall 2025, UIC CS 425, Assignment 2

import vertexShaderSrc from './vertex.glsl.js';
import fragmentShaderSrc from './fragment.glsl.js'

var gl = null;
var vao = null;
var wireframeVAO = null;
var wireframeVertexCount = 0;

var program = null;
var vertexCount = 0;
var uniformModelViewLoc = null;
var uniformProjectionLoc = null;
var heightmapData = null;

var gModelMatrix = identityMatrix();
var gZRot = 0; // global rotation angle around Z axis, in radians
var gXRot = 0; // global rotation angle around X axis, in radians

var eyeX = 0;
var eyeZ = 0;

function processImage(img)
{
	// draw the image into an off-screen canvas
	var off = document.createElement('canvas');
	
	var sw = img.width, sh = img.height;
	off.width = sw; off.height = sh;
	
	var ctx = off.getContext('2d');
	ctx.drawImage(img, 0, 0, sw, sh);
	
	// read back the image pixel data
	var imgd = ctx.getImageData(0,0,sw,sh);
	var px = imgd.data;
	
	// create a an array will hold the height value
	var heightArray = new Float32Array(sw * sh);
	
	// loop through the image, rows then columns
	for (var y=0;y<sh;y++) 
	{
		for (var x=0;x<sw;x++) 
		{
			// offset in the image buffer
			var i = (y*sw + x)*4;
			
			// read the RGB pixel value
			var r = px[i+0], g = px[i+1], b = px[i+2];
			
			// convert to greyscale value between 0 and 1
			var lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255.0;

			// store in array
			heightArray[y*sw + x] = lum;
		}
	}

	return {
		data: heightArray,
		width: sw,
		height: sh
	};
}

function createMeshFromHeightmap(heightmap)
{
	const w = heightmap.width;
	const h = heightmap.height;
	const data = heightmap.data; // 0-1 range
	if (w < 2 || h < 2) return { positions: new Float32Array() };

	const quadsX = w - 1;
	const quadsY = h - 1;
	const quadCount = quadsX * quadsY;
	const FLOATS_PER_QUAD = 18; // 2 triangles * 3 verts * 3 comps
	const positions = new Float32Array(quadCount * FLOATS_PER_QUAD);

	var edgeSet = new Set();


	// Preallocate wireframe array to save memory and improve performance
	const EDGES_PER_QUAD = 5; // TL->TR, TR->BR, BR->BL, BL->TL, TR->BL
	const VALUES_PER_EDGE = 6; // 2 vertices * 3 components
	const wfAlloc = quadCount * EDGES_PER_QUAD * VALUES_PER_EDGE;
	var wireframe = new Float32Array(wfAlloc);

	let wfIndex = 0; // current index in wireframe array
	function addEdge(ax, ay, az, bx, by, bz) {

		// Use a set to avoid duplicate edges (actually don't because it kills performance)
		// const key1 = `${ax},${ay},${az}-${bx},${by},${bz}`;
		// const key2 = `${bx},${by},${bz}-${ax},${ay},${az}`;
		// if (edgeSet.has(key1) || edgeSet.has(key2)) return;

		// edgeSet.add(key1);
		// wireframe.push([ax, ay, az, bx, by, bz]);

		wireframe[wfIndex++] = ax;
		wireframe[wfIndex++] = ay;
		wireframe[wfIndex++] = az;
		wireframe[wfIndex++] = bx;
		wireframe[wfIndex++] = by;
		wireframe[wfIndex++] = bz;
	}

	let p = 0; // index
	for (let row = 0; row < h - 1; row++) {
		const rowOffset = row * w;
		const nextRowOffset = (row + 1) * w;
		const z0 = 2 * (row / (h - 1)) - 1;
		const z1 = 2 * ((row + 1) / (h - 1)) - 1;
		for (let col = 0; col < w - 1; col++) {
			const x0 = 2 * (col / (w - 1)) - 1;
			const x1 = 2 * ((col + 1) / (w - 1)) - 1;

			const iTL = rowOffset + col;
			const iTR = rowOffset + (col + 1);
			const iBL = nextRowOffset + col;
			const iBR = nextRowOffset + (col + 1);

			const hTL = 2 * (data[iTL]) - 1;
			const hTR = 2 * (data[iTR]) - 1;
			const hBL = 2 * (data[iBL]) - 1;
			const hBR = 2 * (data[iBR]) - 1;

			// Triangle 1 (TL, TR, BL)
			positions[p++] = x0; positions[p++] = hTL; positions[p++] = z0;
			positions[p++] = x1; positions[p++] = hTR; positions[p++] = z0;
			positions[p++] = x0; positions[p++] = hBL; positions[p++] = z1;
			// Triangle 2 (TR, BR, BL)
			positions[p++] = x1; positions[p++] = hTR; positions[p++] = z0;
			positions[p++] = x1; positions[p++] = hBR; positions[p++] = z1;
			positions[p++] = x0; positions[p++] = hBL; positions[p++] = z1;

			// Add quad perimeter edges (TL->TR, TR->BR, BR->BL, BL->TL, TR->BL)
			addEdge(x0, hTL, z0, x1, hTR, z0); // top
			addEdge(x1, hTR, z0, x1, hBR, z1); // right
			addEdge(x1, hBR, z1, x0, hBL, z1); // bottom
			addEdge(x0, hBL, z1, x0, hTL, z0); // left
			// addEdge(x0, hTR, z0, x0, hBL, z1); // weird diagonal that doesn't look good
			addEdge(x1, hTR, z0, x0, hBL, z1); // diagonal

			// wireframe.push(x0, hTL, z0, x1, hTR, z0,
			// 	x1, hTR, z0, x1, hBR, z1,
			// 	x1, hBR, z1, x0, hBL, z1,
			// 	x0, hBL, z1, x0, hTL, z0,
			// 	x1, hTR, z0, x0, hBL, z1
			// ); 
		}
	}
	gModelMatrix = scaleMatrix(1,1,1); // global model matrix scalar mult

	return { positions: positions, wireframePositions: wireframe };
}

function drawMesh(mesh) {
	// Support either plain array or pre-created Float32Array.
	const posData = mesh.positions;
	vertexCount = posData.length / 3; // global used by draw()
	const posBuffer = createBuffer(gl, gl.ARRAY_BUFFER, posData);

	vao = createVAO(gl,
		gl.getAttribLocation(program, "position"), posBuffer,
		null, null,
		null, null
	);

	if (mesh.wireframePositions) {
		const wfBuffer = createBuffer(gl, gl.ARRAY_BUFFER, mesh.wireframePositions);
		wireframeVertexCount = mesh.wireframePositions.length / 3;
		wireframeVAO = createVAO(gl,
			gl.getAttribLocation(program, "position"), wfBuffer,
			null, null,
			null, null
		);
	}
	
	window.requestAnimationFrame(draw);
}

window.loadImageFile = function(event)
{

	var f = event.target.files && event.target.files[0];
	if (!f) return;
	
	// create a FileReader to read the image file
	var reader = new FileReader();
	reader.onload = function() 
	{
		// create an internal Image object to hold the image into memory
		var img = new Image();
		img.onload = function()
		{
			// Use Date.now() to capture timestamps (milliseconds since epoch).
			var startTime = Date.now();
			console.log("Start time: " + startTime);

			// Process the image to extract heightmap data
			heightmapData = processImage(img);

			console.log("Image processing took " + (Date.now() - startTime) + " ms");
			startTime = Date.now();

			// Create the mesh from the heightmap data
			const mesh = createMeshFromHeightmap(heightmapData);

			console.log("Mesh creation took " + (Date.now() - startTime) + " ms");
			startTime = Date.now();

			// Draw the mesh (create buffers, VAOs, etc.)
			drawMesh(mesh);

			console.log("Mesh draw took " + (Date.now() - startTime) + " ms");
			console.log('loaded image: ' + heightmapData.width + ' x ' + heightmapData.height);

		};
		img.onerror = function() 
		{
			console.error("Invalid image file.");
			alert("The selected file could not be loaded as an image.");
		};

		// the source of the image is the data load from the file
		img.src = reader.result;
	};
	reader.readAsDataURL(f);
}


function setupViewMatrix(eye, target)
{


	// Compute forward, right, and up vectors
    var forward = normalize(subtract(target, eye));
    var upHint  = [0, 1, 0];

    var right = normalize(cross(forward, upHint));
    var up    = cross(right, forward);

    var view = lookAt(eye, target, up);
    return view;

}
function draw()
{

	var fovRadians = 75 * Math.PI / 180;
	var aspectRatio = +gl.canvas.width / +gl.canvas.height;
	var nearClip = 0.0001;
	var farClip = 100.0;

	var projectionMatrix = identityMatrix();

	if (!projectionSelect || projectionSelect.value === 'perspective') {
		// perspective projection (default if control missing)
		projectionMatrix = perspectiveMatrix(
			fovRadians,
			aspectRatio,
			nearClip,
			farClip,
		);
	} else {
		// orthographic projection
		projectionMatrix = orthographicMatrix(
			-gl.canvas.width/100, gl.canvas.width/100,
			-gl.canvas.height/100, gl.canvas.height/100,
			nearClip,
			farClip
		);
	}

	// eye and target
	var eye = [0, 5, 5];
	var target = [0, 0, 0];

	// Build model matrix dynamically: center -> apply rotations -> height scale -> user zoom.
	// Get UI inputs (fallbacks if elements missing).
	var zoomVal = 100; // midpoint default
	var heightVal = 50; // midpoint default
	var rotYDeg = 0; // default
	var zoomSlider = document.getElementById('scale');
	var heightSlider = document.getElementById('height');
	var rotSlider = document.getElementById('rotation');

	
	if (rotSlider) rotYDeg = parseFloat(rotSlider.value);
	if (zoomSlider) zoomVal = parseFloat(zoomSlider.value);
	if (heightSlider) heightVal = parseFloat(heightSlider.value);

	// Map zoom slider [0,200] -> scale [1, 8.0]
	var zoomScale = 1 + (zoomVal / 200) * (8 - 1);
	// Map height slider [0,100] -> height multiplier [0, 1]
	var heightScale = (heightVal / 100) * 1.0;

	// Matrices (note: provided helpers are column-major arrays).
	var centerTranslation = translateMatrix(eyeX, 0, eyeZ);
	var scaleHeight = scaleMatrix(1, Math.max(0.0001, heightScale), 1);
	var uniformZoom = scaleMatrix(zoomScale, zoomScale, zoomScale);

	// setup viewing matrix
	var eyeToTarget = subtract(target, eye);
	var viewMatrix = setupViewMatrix(eye, target);

	var rotX = gXRot * Math.PI / 180;
	var rotXMatrix = rotateXMatrix(rotX);
	var rotY = rotYDeg * Math.PI / 180;
	var rotYMatrix = rotateYMatrix(rotY);
	var rotZ = gZRot * Math.PI / 180;
	var rotZMatrix = rotateZMatrix(rotZ);

	// Do Y so it is applied last (after X and Z)
	// because matrix multiplication is backwards
	// i.e. v' = Ry * Rx * v  means Rx is applied first
	// Combine all rotations into a single matrix
	var finalRotationMatrix = multiplyArrayOfMatrices([rotYMatrix, rotZMatrix, rotXMatrix]);

	// model -> rotate -> scaling -> uniform zoom -> translate
	var modelMatrix = multiplyArrayOfMatrices([
		centerTranslation,
		uniformZoom,
		scaleHeight,
		finalRotationMatrix,
		gModelMatrix
	]);

	// model-view Matrix = view * model
	var modelviewMatrix = multiplyArrayOfMatrices([viewMatrix, modelMatrix]);


	// enable depth testing
	gl.enable(gl.DEPTH_TEST);

	// disable face culling to render both sides of the triangles
	gl.disable(gl.CULL_FACE);

	gl.clearColor(0.2, 0.2, 0.2, 1);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	gl.useProgram(program);
	
	// update modelview and projection matrices to GPU as uniforms
	gl.uniformMatrix4fv(uniformModelViewLoc, false, new Float32Array(modelviewMatrix));
	gl.uniformMatrix4fv(uniformProjectionLoc, false, new Float32Array(projectionMatrix));


	if (wireframeCheckbox && wireframeCheckbox.checked && wireframeVAO) {
		  gl.bindVertexArray(wireframeVAO);
		  gl.drawArrays(gl.LINES, 0, wireframeVertexCount);
	} else {
		  gl.bindVertexArray(vao);
		  gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
	}

	requestAnimationFrame(draw);

}

function createBox()
{
	function transformTriangle(triangle, matrix) {
		var v1 = [triangle[0], triangle[1], triangle[2], 1];
		var v2 = [triangle[3], triangle[4], triangle[5], 1];
		var v3 = [triangle[6], triangle[7], triangle[8], 1];

		var newV1 = multiplyMatrixVector(matrix, v1);
		var newV2 = multiplyMatrixVector(matrix, v2);
		var newV3 = multiplyMatrixVector(matrix, v3);

		return [
			newV1[0], newV1[1], newV1[2],
			newV2[0], newV2[1], newV2[2],
			newV3[0], newV3[1], newV3[2]
		];
	}

	var box = [];

	var triangle1 = [
		-1, -1, +1,
		-1, +1, +1,
		+1, -1, +1,
	];
	box.push(...triangle1)

	var triangle2 = [
		+1, -1, +1,
		-1, +1, +1,
		+1, +1, +1
	];
	box.push(...triangle2);

	// 3 rotations of the above face
	for (var i=1; i<=3; i++) 
	{
		var yAngle = i* (90 * Math.PI / 180);
		var yRotMat = rotateYMatrix(yAngle);

		var newT1 = transformTriangle(triangle1, yRotMat);
		var newT2 = transformTriangle(triangle2, yRotMat);

		box.push(...newT1);
		box.push(...newT2);
	}

	// a rotation to provide the base of the box
	var xRotMat = rotateXMatrix(90 * Math.PI / 180);
	box.push(...transformTriangle(triangle1, xRotMat));
	box.push(...transformTriangle(triangle2, xRotMat));


	return {
		positions: box
	};

}

var isDragging = false;
var startX, startY;
var leftMouse = false;
var rightMouse = false;

function addMouseCallback(canvas)
{
	isDragging = false;

	canvas.addEventListener("mousedown", function (e) 
	{
		if (e.button === 0) {
			console.log("Left button pressed");
			leftMouse = true;
		} else if (e.button === 2) {
			console.log("Right button pressed");
			rightMouse = true;
		}

		isDragging = true;
		startX = e.offsetX;
		startY = e.offsetY;
	});

	canvas.addEventListener("contextmenu", function(e)  {
		e.preventDefault(); // disables the default right-click menu
	});


	canvas.addEventListener("wheel", function(e)  {
		e.preventDefault(); // prevents page scroll

		if (e.deltaY < 0) 
		{
			console.log("Scrolled up");

			scaleRange.value = Math.min(200, parseFloat(scaleRange.value) + 10);
			// update zoom
			// e.g., zoom in
		} else {
			console.log("Scrolled down");
			scaleRange.value = Math.max(0, parseFloat(scaleRange.value) - 10);
			// e.g., zoom out
		}
	});

	document.addEventListener("mousemove", function (e) {
		if (!isDragging) return;
		var currentX = e.offsetX;
		var currentY = e.offsetY;

		var deltaX = currentX - startX;
		var deltaY = currentY - startY;
		// console.log('mouse drag by: ' + deltaX + ', ' + deltaY); //heavy spam

		// implement dragging logic
		if (leftMouse){
			gZRot += deltaX * 0.2;
			gXRot += deltaY * -0.2;
		}

		if (rightMouse) {
			// pan with zoom factored in for absolutely no reason lol
			var scaleVal = parseFloat(scaleRange.value);
			eyeX += deltaX * 0.01 * (1.25-scaleVal/200);
			eyeZ += deltaY * 0.01 * (1.25-scaleVal/200); 
		}
		startX = currentX;
		startY = currentY;
	});

	document.addEventListener("mouseup", function (e) {
		isDragging = false;
		if (e.button === 0) {
			leftMouse = false;
		} else if (e.button === 2) {
			rightMouse = false;
		}
	});

	document.addEventListener("mouseleave", () => {
		isDragging = false;
	});
}

const scaleRange = document.getElementById("scale");
const projectionSelect = document.getElementById("projectionType");
const wireframeCheckbox = document.getElementById("wireframe");

function initialize() 
{
	var canvas = document.querySelector("#glcanvas");
	canvas.width = canvas.clientWidth;
	canvas.height = canvas.clientHeight;

	gl = canvas.getContext("webgl2");

	// add mouse callbacks
	addMouseCallback(canvas);

	var box = createBox();
	vertexCount = box.positions.length / 3;		// vertexCount is global variable used by draw()
	console.log(box);


	// create buffers to put in box
	var boxVertices = new Float32Array(box['positions']);
	var posBuffer = createBuffer(gl, gl.ARRAY_BUFFER, boxVertices);

	var vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSrc);
	var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc);
	program = createProgram(gl, vertexShader, fragmentShader);

	// attributes (per vertex)
	var posAttribLoc = gl.getAttribLocation(program, "position");

	// uniforms
	uniformModelViewLoc = gl.getUniformLocation(program, 'modelview');
	uniformProjectionLoc = gl.getUniformLocation(program, 'projection');

	vao = createVAO(gl, 
		// positions
		posAttribLoc, posBuffer, 

		// normals (unused in this assignments)
		null, null, 

		// colors (not needed--computed by shader)
		null, null
	);

	// load "rainier-small.jpeg" as test image
	var img = new Image();
	img.onload = function() {
		if (!img) {
			console.log("Unable to load default image: 'rainier-small.jpeg', rendering box instead");
			return;
		}
		heightmapData = processImage(img);
		const mesh = createMeshFromHeightmap(heightmapData);
		drawMesh(mesh);
	};
	img.src = "rainier-small.jpeg";

	window.requestAnimationFrame(draw);
}

window.onload = initialize();