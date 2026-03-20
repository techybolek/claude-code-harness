---
name: pptx
description: Create PowerPoint presentations with CGI corporate theme. Use when user asks to create a PPTX, PowerPoint, presentation, slide deck, or slides. Generates .pptx files from raw Open XML with CGI branding (colors, fonts, gradient bar, footer).
---

# PowerPoint Presentation Generator — CGI Theme

Generate `.pptx` files by assembling Open XML (OOXML) parts directly — no external libraries needed. Use `zip` to package.

## CGI Theme Reference

### Brand Colors
| Token       | Hex       | Usage                              |
|-------------|-----------|-------------------------------------|
| dk2         | `#200A58` | Primary heading text, dark navy     |
| accent1     | `#5236AB` | Purple accent, links                |
| accent2     | `#9E83F5` | Light purple accent                 |
| accent3     | `#CBC3E6` | Lightest purple                     |
| accent4     | `#E31937` | CGI Red primary                     |
| accent5     | `#991F3D` | Dark red                            |
| accent6     | `#650A21` | Darkest red                         |
| midpurple   | `#B91C4A` | Red-purple midpoint                 |
| body-text   | `#333333` | Body text                           |
| footer-text | `#666666` | Footer text                         |

### Signature Gradient Bar
A horizontal bar with left-to-right gradient used on title/highlight slides:
```xml
<a:gradFill rotWithShape="1">
  <a:gsLst>
    <a:gs pos="0"><a:srgbClr val="E31937"><a:alpha val="65000"/></a:srgbClr></a:gs>
    <a:gs pos="25000"><a:srgbClr val="B91C4A"><a:alpha val="65000"/></a:srgbClr></a:gs>
    <a:gs pos="50000"><a:srgbClr val="7B2D7B"><a:alpha val="65000"/></a:srgbClr></a:gs>
    <a:gs pos="75000"><a:srgbClr val="5236AB"><a:alpha val="65000"/></a:srgbClr></a:gs>
    <a:gs pos="100000"><a:srgbClr val="200A58"><a:alpha val="65000"/></a:srgbClr></a:gs>
  </a:gsLst>
  <a:lin ang="0" scaled="1"/>
</a:gradFill>
```

### Fonts
- **Headings**: Trebuchet MS, bold
- **Body**: Arial
- **Footer**: Arial 9pt

### Slide Dimensions
- **16:9**: `cx="9144000" cy="5143500"` (EMU)
- Standard content area: x=457200, width=8229600

### Footer (on Slide Master)
Every slide inherits:
- Bottom-left: `© 2026 CGI Inc.` (Arial 9pt, #666666)
- Bottom-center: `Internal` (Arial 9pt, #000000 @ 50% alpha)

## Assembly Process

When the user asks to create a presentation, follow these steps:

### Step 1: Plan the slides
Ask the user (or determine from context) what slides are needed. Common slide types:
- **Title slide**: Large heading text above gradient bar, highlight text inside gradient bar, subtitle below
- **Content slide**: Title bar + body text with bullet points
- **Two-column slide**: Side-by-side content blocks (like Pre-Award / Post-Award boxes)
- **Section divider**: Gradient background with white text

### Step 2: Generate the PPTX

Use bash to create the directory structure and write all XML files, then zip into .pptx.

#### Directory structure
```
pptx_build/
├── [Content_Types].xml
├── _rels/
│   └── .rels
├── docProps/
│   ├── app.xml
│   └── core.xml
├── docMetadata/
│   └── LabelInfo.xml
└── ppt/
    ├── presentation.xml
    ├── presProps.xml
    ├── viewProps.xml
    ├── tableStyles.xml
    ├── _rels/
    │   └── presentation.xml.rels
    ├── theme/
    │   └── theme1.xml
    ├── slideMasters/
    │   ├── slideMaster1.xml
    │   └── _rels/
    │       └── slideMaster1.xml.rels
    ├── slideLayouts/
    │   ├── slideLayout1.xml
    │   └── _rels/
    │       └── slideLayout1.xml.rels
    └── slides/
        ├── slide1.xml
        ├── slide2.xml
        └── _rels/
            ├── slide1.xml.rels
            └── slide2.xml.rels
```

#### Boilerplate XML Files

**[Content_Types].xml** — Must list every slide. Add one `<Override>` per slide:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>
  <Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>
  <Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>
  <!-- Add per slide: -->
  <Override PartName="/ppt/slides/slideN.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  <Override PartName="/docMetadata/LabelInfo.xml" ContentType="application/vnd.ms-office.classificationlabels+xml"/>
</Types>
```

**_rels/.rels**:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
```

**ppt/presentation.xml** — Add `<p:sldId>` per slide with unique id (start at 2147471714, increment by 1) and rId (rId2, rId3, ...):
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1" autoCompressPictures="0">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>
    <p:sldId id="2147471714" r:id="rId2"/>
    <!-- more slides -->
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="5143500" type="screen16x9"/>
  <p:notesSz cx="5143500" cy="9144000"/>
  <p:defaultTextStyle>
    <a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">
      <a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr>
    </a:lvl1pPr>
  </p:defaultTextStyle>
</p:presentation>
```

**ppt/_rels/presentation.xml.rels** — rId1=slideMaster, rId2+=slides, then theme/presProps/viewProps/tableStyles:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <!-- more slide rels -->
  <Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
  <Relationship Id="rIdP" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>
  <Relationship Id="rIdV" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>
  <Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>
</Relationships>
```

**ppt/theme/theme1.xml** — Full CGI theme (copy verbatim):
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="CGI Slide Master"><a:themeElements><a:clrScheme name="CGI"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="200A58"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2><a:accent1><a:srgbClr val="5236AB"/></a:accent1><a:accent2><a:srgbClr val="9E83F5"/></a:accent2><a:accent3><a:srgbClr val="CBC3E6"/></a:accent3><a:accent4><a:srgbClr val="E31937"/></a:accent4><a:accent5><a:srgbClr val="991F3D"/></a:accent5><a:accent6><a:srgbClr val="650A21"/></a:accent6><a:hlink><a:srgbClr val="5236AB"/></a:hlink><a:folHlink><a:srgbClr val="5236AB"/></a:folHlink></a:clrScheme><a:fontScheme name="CGI Font theme"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:lumMod val="110000"/><a:satMod val="105000"/><a:tint val="67000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="103000"/><a:tint val="73000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="109000"/><a:tint val="81000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:satMod val="103000"/><a:lumMod val="102000"/><a:tint val="94000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:satMod val="110000"/><a:lumMod val="100000"/><a:shade val="100000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="99000"/><a:satMod val="120000"/><a:shade val="78000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="57150" dist="19050" dir="5400000" algn="ctr" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="63000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="93000"/><a:satMod val="150000"/><a:shade val="98000"/><a:lumMod val="102000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:tint val="98000"/><a:satMod val="130000"/><a:shade val="90000"/><a:lumMod val="103000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="63000"/><a:satMod val="120000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>
```

**ppt/slideMasters/slideMaster1.xml** — includes CGI footer:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="3" name="Classification"/><p:cNvSpPr txBox="1"/><p:nvPr userDrawn="1"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="4381500" y="4950000"/><a:ext cx="412750" cy="137160"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr horzOverflow="overflow" lIns="0" tIns="0" rIns="0" bIns="0"><a:spAutoFit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="l"/><a:r><a:rPr lang="en-US" sz="900"><a:solidFill><a:srgbClr val="000000"><a:alpha val="50000"/></a:srgbClr></a:solidFill><a:latin typeface="Arial" pitchFamily="34" charset="0"/><a:cs typeface="Arial" pitchFamily="34" charset="0"/></a:rPr><a:t>Internal</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="4" name="CGI Footer"/><p:cNvSpPr txBox="1"/><p:nvPr userDrawn="1"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="457200" y="4950000"/><a:ext cx="1828800" cy="137160"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t" anchorCtr="0"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="900" dirty="0"><a:solidFill><a:srgbClr val="666666"/></a:solidFill><a:latin typeface="Arial" pitchFamily="34" charset="0"/></a:rPr><a:t>© 2026 CGI Inc.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:hf sldNum="0" hdr="0" ftr="0" dt="0"/><p:txStyles><p:titleStyle><a:lvl1pPr algn="ctr" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/><a:defRPr sz="4400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/><a:cs typeface="+mj-cs"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr marL="342900" indent="-342900" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="•"/><a:defRPr sz="3200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>
```

**Remaining boilerplate** (copy these verbatim for every presentation):

**ppt/slideMasters/_rels/slideMaster1.xml.rels**:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>
```

**ppt/slideLayouts/slideLayout1.xml**:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" preserve="1"><p:cSld name="DEFAULT"><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>
```

**ppt/slideLayouts/_rels/slideLayout1.xml.rels**:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>
```

**Each slide's _rels/slideN.xml.rels**:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>
```

**ppt/presProps.xml**:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>
```

**ppt/viewProps.xml**:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:viewPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:slideViewPr><p:cSldViewPr><p:cViewPr varScale="1"><p:scale><a:sx n="104" d="100"/><a:sy n="104" d="100"/></p:scale><p:origin x="-1236" y="-90"/></p:cViewPr><p:guideLst><p:guide orient="horz" pos="2160"/><p:guide pos="2880"/></p:guideLst></p:cSldViewPr></p:slideViewPr><p:notesTextViewPr><p:cViewPr><p:scale><a:sx n="1" d="1"/><a:sy n="1" d="1"/></p:scale><p:origin x="0" y="0"/></p:cViewPr></p:notesTextViewPr></p:viewPr>
```

**ppt/tableStyles.xml**:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>
```

**docProps/app.xml**:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Claude Code</Application><Slides>NUM_SLIDES</Slides></Properties>
```

**docProps/core.xml**:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>PRESENTATION_TITLE</dc:title>
  <dc:creator>Claude Code</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:modified>
</cp:coreProperties>
```

**docMetadata/LabelInfo.xml**:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<clbl:labelList xmlns:clbl="http://schemas.microsoft.com/office/2020/mipLabelMetadata"/>
```

### Step 3: Build slides

Each slide is a `ppt/slides/slideN.xml` file. Use these CGI-themed patterns:

#### Title Slide Pattern
Uses the signature gradient bar with a highlight phrase:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld name="Title Slide">
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <!-- Line 1: dark navy text above gradient -->
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Text Above"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="457200" y="820000"/><a:ext cx="8229600" cy="600000"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln/>
        </p:spPr>
        <p:txBody>
          <a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="ctr"/>
          <a:lstStyle/>
          <a:p><a:pPr marL="0" indent="0"><a:buNone/></a:pPr>
            <a:r><a:rPr lang="en-US" sz="3000" b="1" dirty="0"><a:solidFill><a:srgbClr val="200A58"/></a:solidFill><a:latin typeface="Trebuchet MS" pitchFamily="34" charset="0"/></a:rPr>
              <a:t>TEXT_ABOVE_GRADIENT</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
      <!-- Gradient bar -->
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="GradientBar"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="457200" y="1560000"/><a:ext cx="8229600" cy="914400"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          <a:gradFill rotWithShape="1">
            <a:gsLst>
              <a:gs pos="0"><a:srgbClr val="E31937"><a:alpha val="65000"/></a:srgbClr></a:gs>
              <a:gs pos="25000"><a:srgbClr val="B91C4A"><a:alpha val="65000"/></a:srgbClr></a:gs>
              <a:gs pos="50000"><a:srgbClr val="7B2D7B"><a:alpha val="65000"/></a:srgbClr></a:gs>
              <a:gs pos="75000"><a:srgbClr val="5236AB"><a:alpha val="65000"/></a:srgbClr></a:gs>
              <a:gs pos="100000"><a:srgbClr val="200A58"><a:alpha val="65000"/></a:srgbClr></a:gs>
            </a:gsLst>
            <a:lin ang="0" scaled="1"/>
          </a:gradFill><a:ln/>
        </p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody>
      </p:sp>
      <!-- Highlight text inside gradient -->
      <p:sp>
        <p:nvSpPr><p:cNvPr id="4" name="Highlight Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="457200" y="1560000"/><a:ext cx="8229600" cy="914400"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln/>
        </p:spPr>
        <p:txBody>
          <a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="ctr"/>
          <a:lstStyle/>
          <a:p><a:pPr marL="0" indent="0" algn="ctr"><a:buNone/></a:pPr>
            <a:r><a:rPr lang="en-US" sz="4800" b="1" dirty="0"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:latin typeface="Trebuchet MS" pitchFamily="34" charset="0"/></a:rPr>
              <a:t>HIGHLIGHT_TEXT</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
      <!-- Text below gradient -->
      <p:sp>
        <p:nvSpPr><p:cNvPr id="5" name="Text Below"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="457200" y="2560000"/><a:ext cx="8229600" cy="500000"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln/>
        </p:spPr>
        <p:txBody>
          <a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="ctr"/>
          <a:lstStyle/>
          <a:p><a:pPr marL="0" indent="0"><a:buNone/></a:pPr>
            <a:r><a:rPr lang="en-US" sz="3000" b="1" dirty="0"><a:solidFill><a:srgbClr val="200A58"/></a:solidFill><a:latin typeface="Trebuchet MS" pitchFamily="34" charset="0"/></a:rPr>
              <a:t>TEXT_BELOW_GRADIENT</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>
```

#### Content Slide Pattern
Title + bullet body text:
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <!-- Title with white background -->
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="457200" y="274638"/><a:ext cx="8229600" cy="569424"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
        </p:spPr>
        <p:txBody>
          <a:bodyPr><a:normAutofit/></a:bodyPr><a:lstStyle/>
          <a:p><a:r><a:rPr lang="en-US" sz="2400" b="1" dirty="0"><a:solidFill><a:srgbClr val="1A1A1A"/></a:solidFill><a:latin typeface="Arial"/></a:rPr>
            <a:t>SLIDE_TITLE</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <!-- Body content -->
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="457200" y="1000000"/><a:ext cx="8229600" cy="3700000"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
        </p:spPr>
        <p:txBody>
          <a:bodyPr vert="horz" wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t" anchorCtr="0">
            <a:normAutofit fontScale="65000" lnSpcReduction="20000"/>
          </a:bodyPr>
          <a:lstStyle/>
          <!-- Section heading -->
          <a:p><a:r><a:rPr lang="en-US" sz="1400" b="1" dirty="0"><a:solidFill><a:prstClr val="black"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>Section: </a:t></a:r><a:r><a:rPr lang="en-US" sz="1400" dirty="0"/><a:t>Body text here.</a:t></a:r></a:p>
          <!-- Spacing paragraph -->
          <a:p><a:pPr><a:spcBef><a:spcPts val="180"/></a:spcBef></a:pPr><a:endParaRPr lang="en-US" sz="1400" dirty="0"><a:latin typeface="Arial"/></a:endParaRPr></a:p>
          <!-- Bullet items -->
          <a:p><a:pPr marL="342900" lvl="1" indent="-342900"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr><a:r><a:rPr lang="en-US" sz="1400" b="0" dirty="0"><a:latin typeface="Arial"/></a:rPr><a:t>Bullet point text</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>
```

#### Two-Column Box Pattern
Side-by-side boxes with colored borders (like Pre-Award/Post-Award):
```xml
<!-- Left box: navy border -->
<p:sp>
  <p:nvSpPr><p:cNvPr id="6" name="LeftBox"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr>
    <a:xfrm><a:off x="457200" y="3250000"/><a:ext cx="3886200" cy="1000000"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    <a:solidFill><a:srgbClr val="200A58"><a:alpha val="8000"/></a:srgbClr></a:solidFill>
    <a:ln w="12700"><a:solidFill><a:srgbClr val="200A58"/></a:solidFill></a:ln>
  </p:spPr>
  <p:txBody>
    <a:bodyPr wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"/>
    <a:lstStyle/>
    <a:p><a:pPr algn="ctr"><a:buNone/></a:pPr><a:r><a:rPr lang="en-US" sz="1400" b="1" dirty="0"><a:solidFill><a:srgbClr val="200A58"/></a:solidFill><a:latin typeface="Calibri" pitchFamily="34" charset="0"/></a:rPr><a:t>BOX_TITLE</a:t></a:r></a:p>
    <a:p><a:pPr algn="ctr"><a:buNone/></a:pPr><a:r><a:rPr lang="en-US" sz="1200" b="0" dirty="0"><a:solidFill><a:srgbClr val="333333"/></a:solidFill><a:latin typeface="Calibri" pitchFamily="34" charset="0"/></a:rPr><a:t>Box description text.</a:t></a:r></a:p>
  </p:txBody>
</p:sp>
<!-- Right box: red border -->
<p:sp>
  <p:nvSpPr><p:cNvPr id="8" name="RightBox"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr>
    <a:xfrm><a:off x="4800600" y="3250000"/><a:ext cx="3886200" cy="1000000"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    <a:solidFill><a:srgbClr val="E31937"><a:alpha val="8000"/></a:srgbClr></a:solidFill>
    <a:ln w="12700"><a:solidFill><a:srgbClr val="E31937"/></a:solidFill></a:ln>
  </p:spPr>
  <p:txBody>
    <a:bodyPr wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"/>
    <a:lstStyle/>
    <a:p><a:pPr algn="ctr"><a:buNone/></a:pPr><a:r><a:rPr lang="en-US" sz="1400" b="1" dirty="0"><a:solidFill><a:srgbClr val="B91C4A"/></a:solidFill><a:latin typeface="Calibri" pitchFamily="34" charset="0"/></a:rPr><a:t>BOX_TITLE</a:t></a:r></a:p>
    <a:p><a:pPr algn="ctr"><a:buNone/></a:pPr><a:r><a:rPr lang="en-US" sz="1200" b="0" dirty="0"><a:solidFill><a:srgbClr val="333333"/></a:solidFill><a:latin typeface="Calibri" pitchFamily="34" charset="0"/></a:rPr><a:t>Box description text.</a:t></a:r></a:p>
  </p:txBody>
</p:sp>
```

### Step 4: Package into .pptx

```bash
cd /tmp/claude-1000/pptx_build
zip -r "../FILENAME.pptx" . -x ".*"
cp /tmp/claude-1000/FILENAME.pptx /path/to/output/
```

## Important Notes

- **XML escaping**: Always escape `&` as `&amp;`, `<` as `&lt;`, `>` as `&gt;`, `"` as `&quot;` in text content
- **Shape IDs**: Must be unique within each slide (start at 1 for group, 2+ for shapes)
- **Relationship IDs**: Must be consistent between .rels files and references
- **EMU units**: 1 inch = 914400 EMU. Standard positions: left margin x=457200 (0.5"), content width cx=8229600 (9")
- **Font sizes**: In hundredths of a point (sz="1400" = 14pt, sz="2400" = 24pt, sz="3000" = 30pt)
- **Auto-fit**: Use `<a:normAutofit fontScale="65000" lnSpcReduction="20000"/>` for dense content slides
- Output the final .pptx to the user's current working directory or a path they specify
- Always tell the user where the file was saved
