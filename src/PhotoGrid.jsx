// PhotoGrid – AI Powered Photo Layout PDF Generator
// Production-ready React application with full PDF generation support
// Author: PhotoGrid CSE Final Year Project

import { useState, useCallback, useRef, useEffect, useContext, createContext, useReducer } from "react";

// ============================================================
// UNIT CONVERSION UTILITY MODULE
// ============================================================
const UNITS = {
  IN: "in",
  MM: "mm",
  PX: "px",
};

const PPI = 96; // pixels per inch

const unitConversion = {
  toInches: (value, fromUnit) => {
    const v = parseFloat(value) || 0;
    switch (fromUnit) {
      case UNITS.IN: return v;
      case UNITS.MM: return v / 25.4;
      case UNITS.PX: return v / PPI;
      default: return v;
    }
  },
  fromInches: (inches, toUnit) => {
    switch (toUnit) {
      case UNITS.IN: return parseFloat(inches.toFixed(4));
      case UNITS.MM: return parseFloat((inches * 25.4).toFixed(2));
      case UNITS.PX: return Math.round(inches * PPI);
      default: return inches;
    }
  },
  convert: (value, fromUnit, toUnit) => {
    const inches = unitConversion.toInches(value, fromUnit);
    return unitConversion.fromInches(inches, toUnit);
  },
  label: (unit) => {
    switch (unit) {
      case UNITS.IN: return "in";
      case UNITS.MM: return "mm";
      case UNITS.PX: return "px";
      default: return unit;
    }
  },
};

// ============================================================
// PAGE SIZE PRESETS (in inches)
// ============================================================
const PAGE_SIZES = {
  A4: { width: 8.2677, height: 11.6929, label: "A4" },
  A3: { width: 11.6929, height: 16.5354, label: "A3" },
  Letter: { width: 8.5, height: 11, label: "Letter" },
  Custom: { width: 8.5, height: 11, label: "Custom" },
};

// ============================================================
// LAYOUT CALCULATION ENGINE
// ============================================================
const layoutEngine = {
  calculateImagesPerPage: ({ pageW, pageH, margins, imgW, imgH, hSpacing, vSpacing, imgsPerRow, layoutMode }) => {
    const usableW = pageW - margins.left - margins.right;
    const usableH = pageH - margins.top - margins.bottom;
    if (usableW <= 0 || usableH <= 0 || imgW <= 0 || imgH <= 0) return { cols: 0, rows: 0, perPage: 0 };

    let cols, rows;
    if (layoutMode === "single-row") {
      cols = Math.floor((usableW + hSpacing) / (imgW + hSpacing));
      rows = 1;
    } else if (imgsPerRow > 0) {
      cols = imgsPerRow;
      rows = Math.floor((usableH + vSpacing) / (imgH + vSpacing));
    } else {
      cols = Math.max(1, Math.floor((usableW + hSpacing) / (imgW + hSpacing)));
      rows = Math.max(1, Math.floor((usableH + vSpacing) / (imgH + vSpacing)));
    }
    cols = Math.max(1, cols);
    rows = Math.max(1, rows);
    return { cols, rows, perPage: cols * rows };
  },

  distributeImages: (images, quantity, perPage) => {
    const expanded = [];
    images.forEach((img) => {
      const qty = img.quantity || quantity || 1;
      for (let i = 0; i < qty; i++) expanded.push(img);
    });
    const pages = [];
    for (let i = 0; i < expanded.length; i += perPage) {
      pages.push(expanded.slice(i, i + perPage));
    }
    if (pages.length === 0) pages.push([]);
    return pages;
  },
};

// ============================================================
// AI AUTO-ADJUST LOGIC
// ============================================================
const aiAutoAdjust = {
  getDisplayDimensions: (naturalW, naturalH, targetW, targetH, mode) => {
    if (!naturalW || !naturalH) return { w: targetW, h: targetH, x: 0, y: 0 };
    const aspectRatio = naturalW / naturalH;
    const targetRatio = targetW / targetH;

    if (mode === "contain") {
      if (aspectRatio > targetRatio) {
        const w = targetW;
        const h = w / aspectRatio;
        return { w, h, x: 0, y: (targetH - h) / 2 };
      } else {
        const h = targetH;
        const w = h * aspectRatio;
        return { w, h, x: (targetW - w) / 2, y: 0 };
      }
    } else if (mode === "cover" || mode === "smart") {
      if (aspectRatio > targetRatio) {
        const h = targetH;
        const w = h * aspectRatio;
        return { w, h, x: -(w - targetW) / 2, y: 0 };
      } else {
        const w = targetW;
        const h = w / aspectRatio;
        return { w, h, x: 0, y: -(h - targetH) / 2 };
      }
    }
    return { w: targetW, h: targetH, x: 0, y: 0 };
  },
};

// ============================================================
// GLOBAL STATE (Context API)
// ============================================================
const AppContext = createContext(null);

const initialState = {
  images: [],
  pageSize: "A4",
  customPage: { width: 8.5, height: 11 },
  orientation: "portrait",
  pageUnit: UNITS.IN,
  margins: { top: 3 / 25.4, right: 3 / 25.4, bottom: 3 / 25.4, left: 3 / 25.4 }, // default 3mm
  marginUnit: UNITS.MM,
  imageSize: { width: 1.2, height: 1.4 }, // default 1.2 x 1.4 inch
  imageSizeUnit: UNITS.IN,
  spacing: { h: 0.1, v: 0.1 },
  spacingUnit: UNITS.IN,
  layoutMode: "auto-grid",
  imgsPerRow: 0,
  globalQuantity: 1,
  aiEnabled: true,
  aiMode: "contain",
  stroke: { enabled: false, width: 2, color: "#e74c3c" },
  cornerRadius: 0, // px only
  selectedImageIds: [],
  sidebarOpen: true,
  activeSection: "images", // button-nav
};

function appReducer(state, action) {
  switch (action.type) {
    case "SET_IMAGES": return { ...state, images: action.payload };
    case "ADD_IMAGES": return { ...state, images: [...state.images, ...action.payload] };
    case "REMOVE_IMAGE": return { ...state, images: state.images.filter((_, i) => i !== action.payload) };
    case "REORDER_IMAGES": return { ...state, images: action.payload };
    case "UPDATE_IMAGE": return {
      ...state,
      images: state.images.map((img, i) => i === action.index ? { ...img, ...action.payload } : img),
    };
    case "ROTATE_IMAGE": return {
      ...state,
      images: state.images.map((img, i) =>
        i === action.index ? { ...img, rotation: (((img.rotation || 0) + action.delta) % 360 + 360) % 360 } : img
      ),
    };
    case "SET_PAGE_SIZE": return { ...state, pageSize: action.payload };
    case "SET_CUSTOM_PAGE": return { ...state, customPage: action.payload };
    case "SET_ORIENTATION": return { ...state, orientation: action.payload };
    case "SET_PAGE_UNIT": return { ...state, pageUnit: action.payload };
    case "SET_MARGINS": return { ...state, margins: action.payload };
    case "SET_MARGIN_UNIT": return { ...state, marginUnit: action.payload };
    case "SET_IMAGE_SIZE": return { ...state, imageSize: action.payload };
    case "SET_IMAGE_SIZE_UNIT": return { ...state, imageSizeUnit: action.payload };
    case "SET_SPACING": return { ...state, spacing: action.payload };
    case "SET_SPACING_UNIT": return { ...state, spacingUnit: action.payload };
    case "SET_LAYOUT_MODE": return { ...state, layoutMode: action.payload };
    case "SET_IMGS_PER_ROW": return { ...state, imgsPerRow: action.payload };
    case "SET_GLOBAL_QUANTITY": return { ...state, globalQuantity: action.payload };
    case "SET_AI_ENABLED": return { ...state, aiEnabled: action.payload };
    case "SET_AI_MODE": return { ...state, aiMode: action.payload };
    case "SET_STROKE": return { ...state, stroke: { ...state.stroke, ...action.payload } };
    case "SET_CORNER_RADIUS": return { ...state, cornerRadius: action.payload };
    case "TOGGLE_SELECT_IMAGE": {
      const id = action.payload;
      const sel = state.selectedImageIds.includes(id)
        ? state.selectedImageIds.filter((x) => x !== id)
        : [...state.selectedImageIds, id];
      return { ...state, selectedImageIds: sel };
    }
    case "TOGGLE_SIDEBAR": return { ...state, sidebarOpen: !state.sidebarOpen };
    case "SET_SIDEBAR": return { ...state, sidebarOpen: action.payload };
    case "SET_ACTIVE_SECTION": return { ...state, activeSection: action.payload };
    default: return state;
  }
}

// ============================================================
// HELPER HOOKS & COMPONENTS
// ============================================================

function UnitInput({ value, unit, onChange, label, min = 0, step }) {
  const s = step || (unit === UNITS.PX ? 1 : unit === UNITS.MM ? 0.5 : 0.01);
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs text-gray-400 font-medium tracking-wide uppercase">{label}</label>}
      <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg overflow-hidden focus-within:border-amber-500 transition-colors">
        <input
          type="number"
          value={value}
          min={min}
          step={s}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none w-0 min-w-0"
        />
        <span className="px-2 text-xs text-gray-500 border-l border-gray-700 py-2 select-none">
          {unitConversion.label(unit)}
        </span>
      </div>
    </div>
  );
}

function UnitSelector({ value, onChange, className = "" }) {
  return (
    <div className={`flex rounded-lg overflow-hidden border border-gray-700 ${className}`}>
      {Object.values(UNITS).map((u) => (
        <button
          key={u}
          onClick={() => onChange(u)}
          className={`flex-1 px-2 py-1.5 text-xs font-semibold transition-all ${
            value === u
              ? "bg-amber-500 text-gray-900"
              : "bg-gray-800 text-gray-400 hover:bg-gray-700"
          }`}
        >
          {unitConversion.label(u)}
        </button>
      ))}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-gray-800 my-1" />;
}

// ============================================================
// IMAGE UPLOAD COMPONENT
// ============================================================
function ImageUpload({ state, dispatch }) {
  const dropRef = useRef(null);
  const [draggingOver, setDraggingOver] = useState(false);
  const [dragItem, setDragItem] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const processFiles = useCallback((files) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const promises = imageFiles.map((file) =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () =>
            resolve({
              id: `img_${Date.now()}_${Math.random()}`,
              src: e.target.result,
              name: file.name,
              naturalW: img.width,
              naturalH: img.height,
              quantity: 1,
            });
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      })
    );
    Promise.all(promises).then((imgs) => dispatch({ type: "ADD_IMAGES", payload: imgs }));
  }, [dispatch]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDraggingOver(false);
    processFiles(e.dataTransfer.files);
  };

  const handleReorderDrop = (e, toIndex) => {
    e.preventDefault();
    if (dragItem === null || dragItem === toIndex) return;
    const newImages = [...state.images];
    const [moved] = newImages.splice(dragItem, 1);
    newImages.splice(toIndex, 0, moved);
    dispatch({ type: "REORDER_IMAGES", payload: newImages });
    setDragItem(null);
    setDragOver(null);
  };

  return (
    <div className="space-y-3">
      <div
        ref={dropRef}
        onDragOver={(e) => { e.preventDefault(); setDraggingOver(true); }}
        onDragLeave={() => setDraggingOver(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all mb-3 ${
          draggingOver ? "border-amber-400 bg-amber-500/10" : "border-gray-700 hover:border-gray-500"
        }`}
        onClick={() => document.getElementById("file-input").click()}
      >
        <input
          id="file-input"
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => processFiles(e.target.files)}
        />
        <div className="text-3xl mb-2">📁</div>
        <p className="text-xs text-gray-400">Drop images here or <span className="text-amber-400">browse</span></p>
        <p className="text-xs text-gray-600 mt-1">PNG, JPG, WEBP supported</p>
      </div>

      {state.images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
          {state.images.map((img, i) => (
            <div
              key={img.id}
              draggable
              onDragStart={() => setDragItem(i)}
              onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
              onDrop={(e) => handleReorderDrop(e, i)}
              onDragEnd={() => { setDragItem(null); setDragOver(null); }}
              className={`relative group rounded-lg overflow-hidden border-2 transition-all cursor-grab ${
                state.selectedImageIds.includes(img.id)
                  ? "border-amber-500"
                  : dragOver === i
                  ? "border-blue-400"
                  : "border-gray-700"
              }`}
              onClick={() => dispatch({ type: "TOGGLE_SELECT_IMAGE", payload: img.id })}
            >
              <img src={img.src} alt={img.name} className="w-full aspect-square object-cover" style={{ transform: `rotate(${img.rotation || 0}deg)`, transition: "transform 0.2s" }} />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); dispatch({ type: "ROTATE_IMAGE", index: i, delta: -90 }); }}
                  className="text-white text-xs bg-black/70 rounded px-1.5 py-0.5 hover:bg-blue-800"
                  title="Rotate left 90°"
                >↺</button>
                <button
                  onClick={(e) => { e.stopPropagation(); dispatch({ type: "REMOVE_IMAGE", payload: i }); }}
                  className="text-red-400 text-xs bg-black/70 rounded px-1.5 py-0.5 hover:bg-red-900"
                >✕</button>
                <button
                  onClick={(e) => { e.stopPropagation(); dispatch({ type: "ROTATE_IMAGE", index: i, delta: 90 }); }}
                  className="text-white text-xs bg-black/70 rounded px-1.5 py-0.5 hover:bg-blue-800"
                  title="Rotate right 90°"
                >↻</button>
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 p-1">
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); dispatch({ type: "UPDATE_IMAGE", index: i, payload: { quantity: Math.max(1, (img.quantity || 1) - 1) } }); }}
                    className="text-gray-300 text-xs w-4 h-4 flex items-center justify-center bg-gray-800 rounded"
                  >−</button>
                  <span className="text-white text-xs flex-1 text-center">{img.quantity || 1}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); dispatch({ type: "UPDATE_IMAGE", index: i, payload: { quantity: (img.quantity || 1) + 1 } }); }}
                    className="text-gray-300 text-xs w-4 h-4 flex items-center justify-center bg-gray-800 rounded"
                  >+</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {state.images.length > 0 && (
        <p className="text-xs text-gray-600 mt-2 text-center">{state.images.length} image{state.images.length !== 1 ? "s" : ""} · click to select · drag to reorder</p>
      )}
    </div>
  );
}

// ============================================================
// PAGE SETUP COMPONENT (size + orientation + unit)
// ============================================================
function PageSetup({ state, dispatch }) {
  const getPageDims = () => {
    const base = state.pageSize === "Custom" ? state.customPage : PAGE_SIZES[state.pageSize];
    const isLandscape = state.orientation === "landscape";
    const wIn = isLandscape ? Math.max(base.width, base.height) : Math.min(base.width, base.height);
    const hIn = isLandscape ? Math.min(base.width, base.height) : Math.max(base.width, base.height);
    return {
      w: unitConversion.fromInches(wIn, state.pageUnit),
      h: unitConversion.fromInches(hIn, state.pageUnit),
    };
  };

  const dims = getPageDims();

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wide font-medium block mb-1.5">Size</label>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.keys(PAGE_SIZES).map((size) => (
            <button
              key={size}
              onClick={() => dispatch({ type: "SET_PAGE_SIZE", payload: size })}
              className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                state.pageSize === size
                  ? "bg-amber-500 text-gray-900"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700"
              }`}
            >
              {PAGE_SIZES[size].label}
            </button>
          ))}
        </div>
      </div>

      {state.pageSize === "Custom" && (
        <div className="grid grid-cols-2 gap-2">
          <UnitInput
            label="Width"
            value={dims.w}
            unit={state.pageUnit}
            onChange={(v) => {
              const inIn = unitConversion.toInches(v, state.pageUnit);
              dispatch({ type: "SET_CUSTOM_PAGE", payload: { ...state.customPage, width: inIn } });
            }}
          />
          <UnitInput
            label="Height"
            value={dims.h}
            unit={state.pageUnit}
            onChange={(v) => {
              const inIn = unitConversion.toInches(v, state.pageUnit);
              dispatch({ type: "SET_CUSTOM_PAGE", payload: { ...state.customPage, height: inIn } });
            }}
          />
        </div>
      )}

      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wide font-medium block mb-1.5">Orientation</label>
        <div className="grid grid-cols-2 gap-1.5">
          {["portrait", "landscape"].map((o) => (
            <button
              key={o}
              onClick={() => dispatch({ type: "SET_ORIENTATION", payload: o })}
              className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                state.orientation === o
                  ? "bg-amber-500 text-gray-900"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700"
              }`}
            >
              <span>{o === "portrait" ? "↕" : "↔"}</span>
              <span className="capitalize">{o}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wide font-medium block mb-1.5">Unit</label>
        <UnitSelector value={state.pageUnit} onChange={(u) => dispatch({ type: "SET_PAGE_UNIT", payload: u })} />
      </div>

      {state.pageSize !== "Custom" && (
        <div className="bg-gray-800/50 rounded-lg p-2 text-center">
          <p className="text-xs text-gray-500">
            {dims.w} × {dims.h} {unitConversion.label(state.pageUnit)}
          </p>
        </div>
      )}

      {/* Margins sub-section */}
      <div className="pt-2 border-t border-gray-800">
        <MarginSettings state={state} dispatch={dispatch} />
      </div>
    </div>
  );
}

// ============================================================
// MARGIN SETTINGS COMPONENT
// ============================================================
function MarginSettings({ state, dispatch }) {
  const [applyAll, setApplyAll] = useState(true);
  const defaultMM = parseFloat((3).toFixed(2));
  const [allValue, setAllValue] = useState(defaultMM);

  const getMarginDisplay = (side) =>
    unitConversion.fromInches(state.margins[side], state.marginUnit);

  const updateMargin = (side, displayVal) => {
    const inIn = unitConversion.toInches(displayVal, state.marginUnit);
    dispatch({ type: "SET_MARGINS", payload: { ...state.margins, [side]: inIn } });
  };

  const handleApplyAll = (v) => {
    setAllValue(v);
    const inIn = unitConversion.toInches(v, state.marginUnit);
    dispatch({ type: "SET_MARGINS", payload: { top: inIn, bottom: inIn, left: inIn, right: inIn } });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-amber-500 text-sm">📐</span>
        <h4 className="text-xs font-bold text-white tracking-widest uppercase">Margins</h4>
      </div>

      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wide font-medium block mb-1.5">Unit</label>
        <UnitSelector value={state.marginUnit} onChange={(u) => dispatch({ type: "SET_MARGIN_UNIT", payload: u })} />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setApplyAll(!applyAll)}
          className={`w-8 h-4 rounded-full transition-all relative ${applyAll ? "bg-amber-500" : "bg-gray-700"}`}
        >
          <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${applyAll ? "left-[18px]" : "left-0.5"}`} />
        </button>
        <span className="text-xs text-gray-400">Apply to all sides</span>
      </div>

      {applyAll ? (
        <UnitInput label="All Margins" value={allValue} unit={state.marginUnit} onChange={handleApplyAll} min={0} />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {["top", "bottom", "left", "right"].map((side) => (
            <UnitInput
              key={side}
              label={side.charAt(0).toUpperCase() + side.slice(1)}
              value={getMarginDisplay(side)}
              unit={state.marginUnit}
              onChange={(v) => updateMargin(side, v)}
              min={0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// IMAGE SETTINGS PANEL (size, spacing, stroke, corner radius)
// ============================================================
function ImageSettingsPanel({ state, dispatch }) {
  const getImgSizeDisplay = (dim) =>
    unitConversion.fromInches(state.imageSize[dim], state.imageSizeUnit);

  const updateImgSize = (dim, displayVal) => {
    const inIn = unitConversion.toInches(displayVal, state.imageSizeUnit);
    dispatch({ type: "SET_IMAGE_SIZE", payload: { ...state.imageSize, [dim]: inIn } });
  };

  const getSpacingDisplay = (dir) =>
    unitConversion.fromInches(state.spacing[dir], state.spacingUnit);

  const updateSpacing = (dir, displayVal) => {
    const inIn = unitConversion.toInches(displayVal, state.spacingUnit);
    dispatch({ type: "SET_SPACING", payload: { ...state.spacing, [dir]: inIn } });
  };

  return (
    <div className="space-y-4">
      {/* Image Size */}
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wide font-medium block mb-2">Image Size</label>
        <UnitSelector value={state.imageSizeUnit} onChange={(u) => dispatch({ type: "SET_IMAGE_SIZE_UNIT", payload: u })} className="mb-2" />
        <div className="grid grid-cols-2 gap-2">
          <UnitInput label="Width" value={getImgSizeDisplay("width")} unit={state.imageSizeUnit} onChange={(v) => updateImgSize("width", v)} min={0.01} />
          <UnitInput label="Height" value={getImgSizeDisplay("height")} unit={state.imageSizeUnit} onChange={(v) => updateImgSize("height", v)} min={0.01} />
        </div>
      </div>

      {/* Spacing */}
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wide font-medium block mb-2">Spacing</label>
        <UnitSelector value={state.spacingUnit} onChange={(u) => dispatch({ type: "SET_SPACING_UNIT", payload: u })} className="mb-2" />
        <div className="grid grid-cols-2 gap-2">
          <UnitInput label="Horizontal" value={getSpacingDisplay("h")} unit={state.spacingUnit} onChange={(v) => updateSpacing("h", v)} min={0} />
          <UnitInput label="Vertical" value={getSpacingDisplay("v")} unit={state.spacingUnit} onChange={(v) => updateSpacing("v", v)} min={0} />
        </div>
      </div>

      {/* Corner Radius */}
      <div className="pt-2 border-t border-gray-800">
        <label className="text-xs text-gray-400 uppercase tracking-wide font-medium block mb-2">
          Corner Radius <span className="text-gray-600 normal-case">(px only)</span>
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => dispatch({ type: "SET_CORNER_RADIUS", payload: Math.max(0, state.cornerRadius - 1) })}
            className="w-8 h-8 rounded-lg bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 border border-gray-700 text-base font-bold"
          >−</button>
          <div className="flex-1 flex items-center bg-gray-800 border border-gray-700 rounded-lg overflow-hidden focus-within:border-amber-500 transition-colors">
            <input
              type="number"
              min={0}
              max={200}
              value={state.cornerRadius}
              onChange={(e) => dispatch({ type: "SET_CORNER_RADIUS", payload: Math.max(0, parseInt(e.target.value) || 0) })}
              className="flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none text-center"
            />
            <span className="px-2 text-xs text-gray-500 border-l border-gray-700 py-2 select-none">px</span>
          </div>
          <button
            onClick={() => dispatch({ type: "SET_CORNER_RADIUS", payload: Math.min(200, state.cornerRadius + 1) })}
            className="w-8 h-8 rounded-lg bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 border border-gray-700 text-base font-bold"
          >+</button>
        </div>
        {/* Corner preview */}
        <div className="mt-2 flex items-center justify-center">
          <div
            style={{
              width: 48, height: 36,
              backgroundColor: "#374151",
              borderRadius: state.cornerRadius,
              border: "1px solid #4b5563",
              transition: "border-radius 0.2s",
            }}
          />
        </div>
      </div>

      {/* Stroke Section */}
      <div className="pt-2 border-t border-gray-800">
        <StrokeSettings state={state} dispatch={dispatch} />
      </div>
    </div>
  );
}

// ============================================================
// LAYOUT SETTINGS
// ============================================================
function LayoutSettings({ state, dispatch }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-400 uppercase tracking-wide font-medium block mb-1.5">Mode</label>
        <div className="grid grid-cols-3 gap-1">
          {[
            { val: "single-row", label: "Row" },
            { val: "multi-row", label: "Multi" },
            { val: "auto-grid", label: "Grid" },
          ].map(({ val, label }) => (
            <button
              key={val}
              onClick={() => dispatch({ type: "SET_LAYOUT_MODE", payload: val })}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                state.layoutMode === val
                  ? "bg-amber-500 text-gray-900"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {state.layoutMode !== "single-row" && (
        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wide font-medium block mb-1.5">
            Images per Row <span className="text-gray-600">(0 = auto)</span>
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => dispatch({ type: "SET_IMGS_PER_ROW", payload: Math.max(0, state.imgsPerRow - 1) })}
              className="w-8 h-8 rounded-lg bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 border border-gray-700"
            >−</button>
            <span className="flex-1 text-center text-white font-semibold text-sm">
              {state.imgsPerRow === 0 ? "Auto" : state.imgsPerRow}
            </span>
            <button
              onClick={() => dispatch({ type: "SET_IMGS_PER_ROW", payload: state.imgsPerRow + 1 })}
              className="w-8 h-8 rounded-lg bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 border border-gray-700"
            >+</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// AI SETTINGS
// ============================================================
function AISettings({ state, dispatch }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 bg-gray-800 rounded-xl border border-gray-700">
        <div>
          <p className="text-sm text-white font-semibold">AI Adjustment</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {state.aiEnabled ? "Smart aspect ratio protection" : "Manual distortion allowed"}
          </p>
        </div>
        <button
          onClick={() => dispatch({ type: "SET_AI_ENABLED", payload: !state.aiEnabled })}
          className={`w-12 h-6 rounded-full transition-all relative flex-shrink-0 ${state.aiEnabled ? "bg-amber-500" : "bg-gray-700"}`}
        >
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${state.aiEnabled ? "left-7" : "left-1"}`} />
        </button>
      </div>

      {state.aiEnabled && (
        <div>
          <label className="text-xs text-gray-400 uppercase tracking-wide font-medium block mb-1.5">Mode</label>
          <div className="grid grid-cols-3 gap-1">
            {[
              { val: "contain", label: "Contain", desc: "Fit" },
              { val: "cover", label: "Cover", desc: "Fill" },
              { val: "smart", label: "Smart", desc: "AI" },
            ].map(({ val, label, desc }) => (
              <button
                key={val}
                onClick={() => dispatch({ type: "SET_AI_MODE", payload: val })}
                className={`py-2 px-1 text-xs font-semibold rounded-lg transition-all flex flex-col items-center gap-0.5 ${
                  state.aiMode === val
                    ? "bg-amber-500 text-gray-900"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700"
                }`}
              >
                <span>{label}</span>
                <span className={`text-[10px] ${state.aiMode === val ? "text-gray-700" : "text-gray-600"}`}>{desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!state.aiEnabled && (
        <div className="p-3 bg-gray-800/60 rounded-xl border border-gray-700/50">
          <p className="text-xs text-gray-500 text-center">Manual mode — images may stretch</p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// STROKE / BORDER SETTINGS (inside Image Settings)
// ============================================================
const PRESET_COLORS = [
  { label: "Red",    value: "#e74c3c" },
  { label: "Black",  value: "#000000" },
  { label: "White",  value: "#ffffff" },
  { label: "Gold",   value: "#f39c12" },
  { label: "Blue",   value: "#2980b9" },
  { label: "Green",  value: "#27ae60" },
  { label: "Purple", value: "#8e44ad" },
  { label: "Pink",   value: "#e91e8c" },
  { label: "Cyan",   value: "#00bcd4" },
  { label: "Orange", value: "#ff5722" },
  { label: "Silver", value: "#bdc3c7" },
  { label: "Brown",  value: "#795548" },
];

function StrokeSettings({ state, dispatch }) {
  const { stroke } = state;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-amber-500 text-sm">🖊</span>
        <h4 className="text-xs font-bold text-white tracking-widest uppercase">Image Border / Stroke</h4>
      </div>

      <div className="flex items-center justify-between p-3 bg-gray-800 rounded-xl border border-gray-700 transition-all">
        <div>
          <p className="text-sm text-white font-semibold">Border Stroke</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {stroke.enabled ? `${stroke.width}px · ${stroke.color}` : "No border"}
          </p>
        </div>
        <button
          onClick={() => dispatch({ type: "SET_STROKE", payload: { enabled: !stroke.enabled } })}
          className={`w-12 h-6 rounded-full transition-all relative flex-shrink-0 cursor-pointer ${
            stroke.enabled ? "bg-amber-500" : "bg-gray-700"
          }`}
        >
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${stroke.enabled ? "left-7" : "left-1"}`} />
        </button>
      </div>

      {stroke.enabled && (
        <>
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide font-medium block mb-1.5">
              Width <span className="text-gray-600 normal-case">(px only)</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => dispatch({ type: "SET_STROKE", payload: { width: Math.max(1, stroke.width - 1) } })}
                className="w-8 h-8 rounded-lg bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 border border-gray-700 text-base font-bold"
              >−</button>
              <div className="flex-1 flex items-center bg-gray-800 border border-gray-700 rounded-lg overflow-hidden focus-within:border-amber-500 transition-colors">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={stroke.width}
                  onChange={(e) => dispatch({ type: "SET_STROKE", payload: { width: Math.max(1, parseInt(e.target.value) || 1) } })}
                  className="flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none text-center"
                />
                <span className="px-2 text-xs text-gray-500 border-l border-gray-700 py-2 select-none">px</span>
              </div>
              <button
                onClick={() => dispatch({ type: "SET_STROKE", payload: { width: Math.min(50, stroke.width + 1) } })}
                className="w-8 h-8 rounded-lg bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 border border-gray-700 text-base font-bold"
              >+</button>
            </div>
            <div className="mt-2 h-5 rounded flex items-center justify-center overflow-hidden bg-gray-900 border border-gray-700">
              <div style={{ width: "80%", height: Math.min(stroke.width * 1.5, 18), backgroundColor: stroke.color, borderRadius: 2 }} />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide font-medium block mb-1.5">Color Presets</label>
            <div className="grid grid-cols-6 gap-1.5 mb-2">
              {PRESET_COLORS.map(({ label, value }) => (
                <button
                  key={value}
                  title={label}
                  onClick={() => dispatch({ type: "SET_STROKE", payload: { color: value } })}
                  className="relative w-full aspect-square rounded-lg transition-all hover:scale-110"
                  style={{ backgroundColor: value, border: stroke.color === value ? "2.5px solid #f59e0b" : "2px solid #374151" }}
                >
                  {stroke.color === value && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold"
                      style={{ color: ["#ffffff","#f39c12","#bdc3c7"].includes(value) ? "#000" : "#fff" }}>
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide font-medium block mb-1.5">Custom Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={stroke.color}
                  onChange={(e) => dispatch({ type: "SET_STROKE", payload: { color: e.target.value } })}
                  className="w-9 h-9 rounded-lg cursor-pointer border border-gray-700 bg-gray-800 p-0.5"
                />
                <span className="flex-1 text-xs font-mono text-gray-300 bg-gray-800 px-3 py-2 rounded-lg border border-gray-700">
                  {stroke.color.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Preview: stroke touches image, no gap */}
          <div className="flex items-center gap-4 p-3 bg-gray-900 rounded-xl border border-gray-700">
            <div style={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}>
              {/* Checkerboard background simulating image */}
              <div
                style={{
                  width: 56, height: 56,
                  backgroundImage: "repeating-conic-gradient(#3a3a3a 0% 25%, #4a4a4a 0% 50%)",
                  backgroundSize: "10px 10px",
                  borderRadius: state.cornerRadius > 0 ? Math.min(state.cornerRadius, 20) : 4,
                }}
              />
              {/* Stroke on top, touching the image */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: state.cornerRadius > 0 ? Math.min(state.cornerRadius, 20) : 4,
                  boxShadow: `inset 0 0 0 ${stroke.width}px ${stroke.color}`,
                  pointerEvents: "none",
                }}
              />
            </div>
            <div className="text-xs text-gray-500 space-y-1">
              <p><span className="text-gray-400">Width:</span> <span className="text-white font-semibold">{stroke.width}px</span></p>
              <p><span className="text-gray-400">Color:</span> <span className="font-mono" style={{ color: stroke.color }}>■</span> <span className="text-white font-mono">{stroke.color.toUpperCase()}</span></p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// LIVE PREVIEW COMPONENT
// ============================================================
function LivePreview({ state }) {
  const [currentPage, setCurrentPage] = useState(0);
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 500, h: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const getPageDimsIn = () => {
    const base = state.pageSize === "Custom" ? state.customPage : PAGE_SIZES[state.pageSize];
    const isL = state.orientation === "landscape";
    return {
      w: isL ? Math.max(base.width, base.height) : Math.min(base.width, base.height),
      h: isL ? Math.min(base.width, base.height) : Math.max(base.width, base.height),
    };
  };

  const pageDims = getPageDimsIn();
  // Responsive: fit preview into container with padding
  const PAD = 24;
  const availW = Math.max(containerSize.w - PAD * 2, 100);
  const availH = Math.max(containerSize.h - PAD * 2, 100);
  const scaleW = availW / pageDims.w;
  const scaleH = availH / pageDims.h;
  const scale = Math.min(scaleW, scaleH);
  const previewW = pageDims.w * scale;
  const previewH = pageDims.h * scale;

  const marginsScaled = {
    top: state.margins.top * scale,
    bottom: state.margins.bottom * scale,
    left: state.margins.left * scale,
    right: state.margins.right * scale,
  };

  const imgWScaled = state.imageSize.width * scale;
  const imgHScaled = state.imageSize.height * scale;
  const hSpaceScaled = state.spacing.h * scale;
  const vSpaceScaled = state.spacing.v * scale;

  const { cols, rows, perPage } = layoutEngine.calculateImagesPerPage({
    pageW: pageDims.w,
    pageH: pageDims.h,
    margins: state.margins,
    imgW: state.imageSize.width,
    imgH: state.imageSize.height,
    hSpacing: state.spacing.h,
    vSpacing: state.spacing.v,
    imgsPerRow: state.imgsPerRow,
    layoutMode: state.layoutMode,
  });

  const pages = layoutEngine.distributeImages(state.images, state.globalQuantity, perPage || 1);
  const totalPages = pages.length;

  useEffect(() => {
    setCurrentPage(0);
  }, [state.images.length, perPage]);

  const safePage = Math.min(currentPage, totalPages - 1);
  const pageImages = pages[safePage] || [];

  const strokeEnabled = state.stroke.enabled;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 flex-shrink-0">
        <div>
          <h2 className="text-sm font-bold text-white tracking-tight hidden sm:block">Live Preview</h2>
          <p className="text-xs text-gray-500">
            {totalPages} page{totalPages !== 1 ? "s" : ""} · {perPage}/page · {cols}×{rows}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(0, safePage - 1))}
                disabled={safePage === 0}
                className="w-7 h-7 rounded-lg bg-gray-800 text-gray-300 flex items-center justify-center hover:bg-gray-700 disabled:opacity-30 border border-gray-700 text-xs"
              >‹</button>
              <span className="text-xs text-gray-400">{safePage + 1} / {totalPages}</span>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages - 1, safePage + 1))}
                disabled={safePage === totalPages - 1}
                className="w-7 h-7 rounded-lg bg-gray-800 text-gray-300 flex items-center justify-center hover:bg-gray-700 disabled:opacity-30 border border-gray-700 text-xs"
              >›</button>
            </div>
          )}
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden flex items-center justify-center bg-gray-950" style={{ padding: 24 }}>
        <div
          style={{ width: previewW, height: previewH, flexShrink: 0 }}
          className="relative bg-white shadow-2xl shadow-black/50"
        >
          {/* Margin guides */}
          <div
            className="absolute border border-dashed border-blue-300/30 pointer-events-none"
            style={{
              top: marginsScaled.top,
              left: marginsScaled.left,
              right: marginsScaled.right,
              bottom: marginsScaled.bottom,
            }}
          />

          {/* Images */}
          {pageImages.map((img, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const x = marginsScaled.left + col * (imgWScaled + hSpaceScaled);
            const y = marginsScaled.top + row * (imgHScaled + vSpaceScaled);

            if (x + imgWScaled > previewW - marginsScaled.right + 0.5) return null;
            if (y + imgHScaled > previewH - marginsScaled.bottom + 0.5) return null;

            const dims = state.aiEnabled
              ? aiAutoAdjust.getDisplayDimensions(img.naturalW, img.naturalH, imgWScaled, imgHScaled, state.aiMode)
              : { w: imgWScaled, h: imgHScaled, x: 0, y: 0 };

            const borderRadius = state.cornerRadius > 0 ? state.cornerRadius : 0;

            return (
              <div
                key={`${img.id}-${idx}`}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  width: imgWScaled,
                  height: imgHScaled,
                  overflow: "hidden",
                  borderRadius: borderRadius,
                }}
              >
                <img
                  src={img.src}
                  alt={img.name}
                  style={{
                    position: "absolute",
                    left: dims.x,
                    top: dims.y,
                    width: dims.w,
                    height: dims.h,
                    imageRendering: "auto",
                    borderRadius: borderRadius,
                    transform: img.rotation ? `rotate(${img.rotation}deg)` : undefined,
                    transformOrigin: "center center",
                  }}
                />
                {/* Stroke overlay on top of image — always works regardless of AI mode */}
                {strokeEnabled && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: borderRadius,
                      border: `${state.stroke.width}px solid ${state.stroke.color}`,
                      pointerEvents: "none",
                      zIndex: 2,
                    }}
                  />
                )}
              </div>
            );
          })}

          {/* Empty state */}
          {state.images.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-gray-300">
                <div className="text-4xl mb-3 opacity-30">🖼</div>
                <p className="text-sm opacity-50">Upload images to see preview</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PDF GENERATION ENGINE
// ============================================================
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// Helper: draw image with rounded corners onto a canvas and return PNG data URL
function renderImageToCanvasWithRoundedCorners(imgSrc, canvasW, canvasH, radius, aiEnabled, aiMode, naturalW, naturalH, strokeEnabled, strokeColor, strokeWidth, rotation = 0) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");

    const r = Math.min(radius, canvasW / 2, canvasH / 2);

    // Clip to rounded rectangle
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(canvasW - r, 0);
    ctx.quadraticCurveTo(canvasW, 0, canvasW, r);
    ctx.lineTo(canvasW, canvasH - r);
    ctx.quadraticCurveTo(canvasW, canvasH, canvasW - r, canvasH);
    ctx.lineTo(r, canvasH);
    ctx.quadraticCurveTo(0, canvasH, 0, canvasH - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.clip();

    const image = new Image();
    image.onload = () => {
      let dx = 0, dy = 0, dw = canvasW, dh = canvasH;
      if (aiEnabled) {
        const dims = aiAutoAdjust.getDisplayDimensions(naturalW, naturalH, canvasW, canvasH, aiMode);
        dx = dims.x; dy = dims.y; dw = dims.w; dh = dims.h;
      }
      if (rotation && rotation % 360 !== 0) {
        ctx.save();
        ctx.translate(canvasW / 2, canvasH / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(image, dx - canvasW / 2, dy - canvasH / 2, dw, dh);
        ctx.restore();
      } else {
        ctx.drawImage(image, dx, dy, dw, dh);
      }

      // Draw stroke inside rounded clip
      if (strokeEnabled && strokeWidth > 0) {
        const sw = strokeWidth;
        ctx.save();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = sw * 2; // inset: half will be clipped outside
        ctx.beginPath();
        const ir = Math.max(0, r - sw / 2);
        ctx.moveTo(ir, 0);
        ctx.lineTo(canvasW - ir, 0);
        ctx.quadraticCurveTo(canvasW, 0, canvasW, ir);
        ctx.lineTo(canvasW, canvasH - ir);
        ctx.quadraticCurveTo(canvasW, canvasH, canvasW - ir, canvasH);
        ctx.lineTo(ir, canvasH);
        ctx.quadraticCurveTo(0, canvasH, 0, canvasH - ir);
        ctx.lineTo(0, ir);
        ctx.quadraticCurveTo(0, 0, ir, 0);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }

      resolve(canvas.toDataURL("image/png"));
    };
    image.src = imgSrc;
  });
}

async function generatePDF(state) {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  const { jsPDF } = window.jspdf;

  const getPageDimsIn = () => {
    const base = state.pageSize === "Custom" ? state.customPage : PAGE_SIZES[state.pageSize];
    const isL = state.orientation === "landscape";
    return {
      w: isL ? Math.max(base.width, base.height) : Math.min(base.width, base.height),
      h: isL ? Math.min(base.width, base.height) : Math.max(base.width, base.height),
    };
  };

  const pageDims = getPageDimsIn();
  const { cols, rows, perPage } = layoutEngine.calculateImagesPerPage({
    pageW: pageDims.w,
    pageH: pageDims.h,
    margins: state.margins,
    imgW: state.imageSize.width,
    imgH: state.imageSize.height,
    hSpacing: state.spacing.h,
    vSpacing: state.spacing.v,
    imgsPerRow: state.imgsPerRow,
    layoutMode: state.layoutMode,
  });

  const pages = layoutEngine.distributeImages(state.images, state.globalQuantity, perPage || 1);

  const doc = new jsPDF({
    orientation: state.orientation === "landscape" ? "landscape" : "portrait",
    unit: "in",
    format: [pageDims.w, pageDims.h],
  });

  const strokeEnabled = state.stroke.enabled;
  const cornerRadius = state.cornerRadius || 0;
  // High-res canvas scale factor for crisp output
  const CANVAS_SCALE = 4;
  const canvasW = Math.round(state.imageSize.width * PPI * CANVAS_SCALE);
  const canvasH = Math.round(state.imageSize.height * PPI * CANVAS_SCALE);
  const scaledRadius = cornerRadius * CANVAS_SCALE;
  const scaledStrokeWidth = state.stroke.width * CANVAS_SCALE;

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    if (pageIdx > 0) doc.addPage([pageDims.w, pageDims.h], state.orientation === "landscape" ? "landscape" : "portrait");

    const pageImgs = pages[pageIdx];
    for (let idx = 0; idx < pageImgs.length; idx++) {
      const img = pageImgs[idx];
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const xIn = state.margins.left + col * (state.imageSize.width + state.spacing.h);
      const yIn = state.margins.top + row * (state.imageSize.height + state.spacing.v);

      if (xIn + state.imageSize.width > pageDims.w - state.margins.right + 0.01) continue;
      if (yIn + state.imageSize.height > pageDims.h - state.margins.bottom + 0.01) continue;

      if (cornerRadius > 0) {
        // Render image with rounded corners on canvas, then embed as PNG
        const pngDataUrl = await renderImageToCanvasWithRoundedCorners(
          img.src,
          canvasW, canvasH,
          scaledRadius,
          state.aiEnabled, state.aiMode,
          img.naturalW, img.naturalH,
          strokeEnabled, state.stroke.color, scaledStrokeWidth,
          img.rotation || 0
        );
        doc.addImage(pngDataUrl, "PNG", xIn, yIn, state.imageSize.width, state.imageSize.height);
      } else {
        // No rounded corners — use original fast path
        const imgFormat = img.src.startsWith("data:image/png") ? "PNG" : "JPEG";
        if (state.aiEnabled) {
          const dims = aiAutoAdjust.getDisplayDimensions(
            img.naturalW, img.naturalH,
            state.imageSize.width, state.imageSize.height,
            state.aiMode
          );
          doc.addImage(img.src, imgFormat, xIn + dims.x, yIn + dims.y, dims.w, dims.h);
        } else {
          doc.addImage(img.src, imgFormat, xIn, yIn, state.imageSize.width, state.imageSize.height);
        }

        // Draw stroke border in PDF (inset, touching image)
        if (strokeEnabled && state.stroke.width > 0) {
          const hex = state.stroke.color;
          const r = parseInt(hex.slice(1,3),16);
          const g = parseInt(hex.slice(3,5),16);
          const b = parseInt(hex.slice(5,7),16);
          const strokeInIn = state.stroke.width / PPI;
          doc.setDrawColor(r, g, b);
          doc.setLineWidth(strokeInIn);
          doc.rect(xIn + strokeInIn/2, yIn + strokeInIn/2, state.imageSize.width - strokeInIn, state.imageSize.height - strokeInIn);
        }
      }
    }
  }

  doc.save("PhotoGrid-output.pdf");
}

// ============================================================
// PDF GENERATOR BUTTON
// ============================================================
function PDFGenerator({ state }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    if (state.images.length === 0) {
      setError("Please upload at least one image.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await generatePDF(state);
    } catch (e) {
      setError("PDF generation failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border-t border-gray-800">
      {error && (
        <p className="text-xs text-red-400 mb-2 text-center">{error}</p>
      )}
      <button
        onClick={handleGenerate}
        disabled={loading || state.images.length === 0}
        className={`w-full py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2 ${
          loading || state.images.length === 0
            ? "bg-gray-800 text-gray-600 cursor-not-allowed"
            : "bg-gradient-to-r from-amber-500 to-orange-500 text-gray-900 hover:from-amber-400 hover:to-orange-400 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40"
        }`}
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
            Generating PDF...
          </>
        ) : (
          <>
            <span>⬇</span>
            Generate PDF
          </>
        )}
      </button>
      <p className="text-xs text-gray-600 text-center mt-2">
        High-resolution · Multi-page · Print-ready
      </p>
    </div>
  );
}

// ============================================================
// SIDEBAR NAV BUTTONS + SECTION CONTENT
// ============================================================
const NAV_SECTIONS = [
  { key: "images",   icon: "🖼",  label: "Images"   },
  { key: "page",     icon: "📄",  label: "Page"     },
  { key: "image",    icon: "⚙️",  label: "Image"    },
  { key: "layout",   icon: "🔲",  label: "Layout"   },
  { key: "ai",       icon: "🤖",  label: "AI"       },
];

function Sidebar({ state, dispatch }) {
  const active = state.activeSection;

  return (
    <aside
      className={`flex flex-col bg-gray-900 border-r border-gray-800 transition-all duration-300 overflow-hidden ${
        state.sidebarOpen ? "w-80 min-w-80" : "w-0 min-w-0"
      }`}
    >
      <div className="min-w-80 flex flex-col h-full">
        {/* Nav Button Row */}
        <div className="flex border-b border-gray-800 bg-gray-900 flex-shrink-0">
          {NAV_SECTIONS.map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => dispatch({ type: "SET_ACTIVE_SECTION", payload: key })}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 px-1 gap-0.5 text-[10px] font-semibold tracking-wide transition-all border-b-2 ${
                active === key
                  ? "border-amber-500 text-amber-400 bg-gray-800/60"
                  : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/30"
              }`}
            >
              <span className="text-base leading-none">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Section Title */}
        <div className="px-4 pt-3 pb-1 flex-shrink-0">
          <h3 className="text-xs font-bold text-white tracking-widest uppercase flex items-center gap-2">
            <span>{NAV_SECTIONS.find(s => s.key === active)?.icon}</span>
            <span>
              {active === "images" && "Images"}
              {active === "page" && "Page Setup"}
              {active === "image" && "Image Settings"}
              {active === "layout" && "Layout"}
              {active === "ai" && "AI Auto-Adjust"}
            </span>
          </h3>
          <div className="border-t border-gray-800 mt-2" />
        </div>

        {/* Section Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {active === "images" && <ImageUpload state={state} dispatch={dispatch} />}
          {active === "page"   && <PageSetup   state={state} dispatch={dispatch} />}
          {active === "image"  && <ImageSettingsPanel state={state} dispatch={dispatch} />}
          {active === "layout" && <LayoutSettings     state={state} dispatch={dispatch} />}
          {active === "ai"     && <AISettings         state={state} dispatch={dispatch} />}
        </div>

        <PDFGenerator state={state} />
      </div>
    </aside>
  );
}

// ============================================================
// STATS BAR
// ============================================================
function StatsBar({ state }) {
  const getPageDimsIn = () => {
    const base = state.pageSize === "Custom" ? state.customPage : PAGE_SIZES[state.pageSize];
    const isL = state.orientation === "landscape";
    return {
      w: isL ? Math.max(base.width, base.height) : Math.min(base.width, base.height),
      h: isL ? Math.min(base.width, base.height) : Math.max(base.width, base.height),
    };
  };
  const pageDims = getPageDimsIn();
  const { perPage } = layoutEngine.calculateImagesPerPage({
    pageW: pageDims.w, pageH: pageDims.h,
    margins: state.margins,
    imgW: state.imageSize.width, imgH: state.imageSize.height,
    hSpacing: state.spacing.h, vSpacing: state.spacing.v,
    imgsPerRow: state.imgsPerRow, layoutMode: state.layoutMode,
  });
  const pages = layoutEngine.distributeImages(state.images, state.globalQuantity, perPage || 1);
  const totalImages = state.images.reduce((s, img) => s + (img.quantity || 1), 0);

  return (
    <div className="hidden md:flex items-center gap-6 px-6 py-2 bg-gray-900 border-b border-gray-800 text-xs text-gray-500">
      <span>📄 {state.pageSize} {state.orientation}</span>
      <span>🖼 {state.images.length} image{state.images.length !== 1 ? "s" : ""}</span>
      <span>🔁 {totalImages} total</span>
      <span>📋 {pages.length} page{pages.length !== 1 ? "s" : ""}</span>
      <span>⊞ {perPage}/page</span>
      <span className={`ml-auto flex items-center gap-1 ${state.aiEnabled ? "text-amber-400" : "text-gray-600"}`}>
        {state.aiEnabled ? "🤖 AI ON" : "🤖 AI OFF"}
      </span>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) dispatch({ type: "SET_SIDEBAR", payload: false });
      else dispatch({ type: "SET_SIDEBAR", payload: true });
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div
      className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden"
      style={{ fontFamily: "'Chivo', 'Inter', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Chivo:wght@300;400;700;900&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #111; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: #555; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.3; }
      `}</style>

      {/* Top Navigation */}
      <header className="flex items-center gap-4 px-4 py-3 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <button
          onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-all border border-gray-700"
          title="Toggle sidebar"
        >
          ☰
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-amber-400 to-orange-600 rounded-lg flex items-center justify-center text-sm shadow-lg shadow-amber-500/30">
            ✦
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight text-white leading-none">PhotoGrid</h1>
            <p className="text-[10px] text-gray-500 leading-none mt-0.5">AI Photo Layout Generator</p>
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">
            <span className={`w-1.5 h-1.5 rounded-full ${state.aiEnabled ? "bg-amber-400" : "bg-gray-600"}`} />
            {state.aiEnabled ? "AI Active" : "Manual Mode"}
          </span>
        </div>
      </header>

      {/* Stats Bar */}
      <StatsBar state={state} />

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar state={state} dispatch={dispatch} />

        <main className="flex-1 overflow-hidden flex flex-col min-h-0 min-w-0">
          <LivePreview state={state} />
        </main>
      </div>

      {/* Mobile Settings Button - compact so preview gets max space */}
      <div className="md:hidden flex-shrink-0 px-3 py-2 bg-gray-900 border-t border-gray-800">
        <button
          onClick={() => dispatch({ type: "SET_SIDEBAR", payload: true })}
          className="w-full py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-semibold border border-gray-700"
        >
          Open Settings ⚙️
        </button>
      </div>
    </div>
  );
}
