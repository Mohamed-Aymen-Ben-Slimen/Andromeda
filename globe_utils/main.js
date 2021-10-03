/*
 * main.js - AstriaGraph visualization entry point.
 * Copyright (C) 2018-2020 University of Texas
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var numFields = [4, 5, 6, 7, 8, 9]
var infoFields = ["Name", "Country", "CatalogId", "NoradId", "BirthDate", "Operator", "Users", "Purpose", "DetailedPurpose",
	"LaunchMass", "DryMass", "Power", "Lifetime", "Contractor", "LaunchSite", "LaunchVehicle"]
var objectData = {}
var debrisLoaded = false
var orbitEntity = []
var constellations = {}
var simStart = Cesium.JulianDate.now()
var simStop = Cesium.JulianDate.addSeconds(simStart, 60*60*24, new Cesium.JulianDate())
var EGM96_mu = 3.986004415E14
var EGM96_REarth = 6378136.3
var twoPi = (2*Math.PI)

const TypesENUM = {
	ALL: 'ALL',
	ActiveSatellite: 'ActiveSatellite',
	InactiveSatellite: 'InactiveSatellite',
	RocketBody: 'RocketBody',
	Debris: 'Debris',
	Uncategorized: 'Uncategorized'
}

const ColorsEnum = {
	ActiveSatellite: Cesium.Color.DARKORANGE,
	InactiveSatellite: Cesium.Color.CYAN,
	RocketBody: Cesium.Color.MEDIUMORCHID,
	Debris: Cesium.Color.GRAY,
	Uncategorized: Cesium.Color.DEEPPINK
}

function eccentricAnomaly(mean, ecc, tol, maxIter)
{
	var i, curr, prev = mean
	for (i = 1; i <= maxIter; i++)
	{
		curr = prev - (prev - ecc*Math.sin(prev) - mean)/(1 - ecc*Math.cos(prev))
		if (Math.abs(curr - prev) <= tol)
			return(curr % twoPi)
		prev = curr
	}
	return(NaN)
}

function stateVector(ele, posonly=false, tol=1E-6, maxIter=20)
{
	var ecan = eccentricAnomaly(ele.MeanAnom, ele.Ecc, tol, maxIter)
	var tran = 2*Math.atan2(Math.sqrt((1+ele.Ecc)/(1-ele.Ecc))*Math.sin(ecan/2), Math.cos(ecan/2))
	var p = ele.SMA*(1 - ele.Ecc*ele.Ecc)
	var r = p/(1 + ele.Ecc*Math.cos(tran))
	var h = Math.sqrt(EGM96_mu*p), ci = Math.cos(ele.Inc), si = Math.sin(ele.Inc), cr = Math.cos(ele.RAAN),
		sr = Math.sin(ele.RAAN), cw = Math.cos(ele.ArgP + tran), sw = Math.sin(ele.ArgP + tran)

	var pos = new Cesium.Cartesian3(cr*cw-sr*sw*ci, sr*cw+cr*sw*ci, si*sw), pos2 = new Cesium.Cartesian3()
	Cesium.Cartesian3.multiplyByScalar(pos, r, pos2)
	if (posonly)
		return(pos2)

	var vel = new Cesium.Cartesian3(), vel1 = new Cesium.Cartesian3(), vel2 = new Cesium.Cartesian3()
	Cesium.Cartesian3.subtract(Cesium.Cartesian3.multiplyByScalar(pos2, h*ele.Ecc*Math.sin(tran)/(r*p), vel1),
		Cesium.Cartesian3.multiplyByScalar(new Cesium.Cartesian3(cr*sw+sr*cw*ci, sr*sw-cr*cw*ci,-si*cw),h/r,vel2),vel)
	return({pos: pos2, vel: vel})
}

function getDataSources()
{
	var i, fields, recs = dataSources.split(/\r\n|\n/)
	var hdrs = recs[0].split(/\t/)
	dataSources = {}
	$("#DataSrcSelect").append($("<option>", {value: "ALL", text: "All"}))
	for (i = 1; i < recs.length; i++)
	{
		fields = recs[i].split(/\t/)
		dataSources[fields[0]] = fields[1]
		if (fields[0] != "7")
			$("#DataSrcSelect").append($("<option>", {value: fields[0], text: fields[1]}))
	}

	$("#DataSrcSelect").val("ALL")
	$("#DataSrcSelect").selectmenu("refresh")
	getSpaceObjects(intactRso)
}

function getSpaceObjects(rsoInfo)
{
	var fields, val, col, i, j, toks, N = 0, recs = rsoInfo.split(/\r\n|\n/)
	var hdrs = recs[0].split(/\t/)
	for (i in objectData)
		N++

	for (i = 1; i < recs.length; i++)
	{
		objectData[N+i-1] = {}
		fields = recs[i].split(/\t/)
		for (j = fields.length; j < hdrs.length; j++)
			objectData[N+i-1][hdrs[j]] = ""
		for (j = 0; j < fields.length; j++)
		{
			col = hdrs[j]
			if (fields[j].length > 0)
			{
				if (numFields.indexOf(j) != -1)
				{
					val = Number(fields[j])
					if (isNaN(val))
						val = fields[j]
				}
				else
					val = fields[j]
			}
			else
				val = ""
			objectData[N+i-1][col] = val
		}

		if (!debrisLoaded && objectData[N+i-1]["Name"] != "")
		{
			toks = objectData[N+i-1]["Name"].toUpperCase().split(/ |-|\d|\(|\)/)
			if (toks[0] in constellations)
				constellations[toks[0]]++
			else
				constellations[toks[0]] = 1
		}
	}

	if (!debrisLoaded)
	{
		var keys = Object.keys(constellations)
		keys.sort()
		$("#ConstellationSelect").append($("<option>", {value: "ALL", text: "All"}))
		for (i = 0; i < keys.length; i++)
		{
			if (constellations[keys[i]] >= 10)
				$("#ConstellationSelect").append($("<option>", {value: keys[i], text: keys[i]}))
		}
		$("#ConstellationSelect").val("ALL")
		$("#ConstellationSelect").selectmenu("refresh")
	}

	displayObjects()
}

function displayObjects()
{
	var epjd = new Cesium.JulianDate()
	var dsnsel = $("#DataSrcSelect").val(), constsel = $("#ConstellationSelect").val(),
		orgsel = $("#OriginSelect").val(), regsel = $("#RegimeSelect").val()
	var obgType = $("#TypeSelect").val()
	var debcb = window.document.getElementById("DebrisToggle")
	var CRFtoTRF = Cesium.Transforms.computeIcrfToFixedMatrix(simStart)
	var ent, trk, t, col = null, i, s, name, names = [], active = []

	console.log(obgType)

	csView.entities.removeAll()
	csView.entities.suspendEvents()
	for (i = 0; i < orbitEntity.length; i++)
	{
		orbitEntity[i].polyline.width = 0
		orbitEntity[i].label.text = ""
	}
	orbitEntity = []

	for (s in objectData)
	{
		trk = objectData[s]
		if (trk["DataSourceId"] == "7")
			active.push(trk["NoradId"])
		if (trk["DataSourceId"] == "0" && (trk["BirthDate"].length > 4 && Number(trk["BirthDate"].slice(0, 4)) >= 2018) &&
			trk["Name"].search("DEB") == -1 && trk["Name"].search("R/B") == -1 && trk["Name"].search("TBA") == -1)
			active.push(trk["NoradId"])
	}


	for (s in objectData)
	{
		trk = objectData[s]
		if (trk["DataSourceId"] == "7")
			continue
		ent = csView.entities.getById(s)
		if ((dsnsel == "ALL" || dsnsel == trk["DataSourceId"]) && (constsel == "ALL" || trk["Name"].toUpperCase().search(constsel) != -1) &&
			(orgsel == "ALL" || orgsel == trk["Country"]) && (regsel == "ALL" || regsel == trk["OrbitType"]))
		{
			if (trk["Name"] != "")
			{
				if (trk["NoradId"] != "")
					name = `${trk["Name"]} (${trk["NoradId"]})`
				else
					name = `${trk["Name"]} (${trk["CatalogId"]})`
				for (i = 0; i < names.length; i++)
				{
					if (names[i].label == name)
						break
				}
				if (i == names.length)
					names.push({label: name, value: s})
			}

			if (typeof(ent) != "undefined")
			{
				ent.show = (trk["Name"].search("R/B") == -1 && trk["Name"].search("DEB") == -1 && trk["Name"].search("TBA") == -1) || debcb.checked
				ent.description = ""
				continue
			}
		}
		else
		{
			if (typeof(ent) != "undefined")
			{
				ent.show = false
				ent.description = ""
				continue
			}
		}

		Cesium.JulianDate.fromIso8601(trk["Epoch"], epjd)
		t = Cesium.JulianDate.daysDifference(simStart, epjd)
		trk["mmo"] = Math.sqrt(EGM96_mu/(trk["SMA"]*trk["SMA"]*trk["SMA"]))
		trk["MeanAnom"] = (trk["MeanAnom"] + trk["mmo"]*t*86400) % twoPi

		if (active.indexOf(trk["NoradId"]) === -1) {
			col = ColorsEnum.InactiveSatellite
		}


		if (active.indexOf(trk["NoradId"]) >= 0) {
			col = ColorsEnum.ActiveSatellite
		}


		if (trk["Name"].search("R/B") !== -1) {
			col = ColorsEnum.RocketBody
		}

		if (trk["Name"].search("DEB") >= 0)
			col = ColorsEnum.Debris
		if ((trk["DataSourceId"] === "3" && trk["NoradId"] === "") || trk["DataSourceId"] === "4" || trk["Name"].search("TBA") !== -1)
			col = ColorsEnum.Uncategorized

		if (obgType === TypesENUM.ALL ||
			col === ColorsEnum.InactiveSatellite && obgType === TypesENUM.InactiveSatellite ||
			col === ColorsEnum.ActiveSatellite && obgType === TypesENUM.ActiveSatellite ||
			col === ColorsEnum.Debris && obgType === TypesENUM.Debris ||
			col === ColorsEnum.RocketBody && obgType === TypesENUM.RocketBody ||
			col === ColorsEnum.Uncategorized && obgType === TypesENUM.Uncategorized
				)

			csView.entities.add({id: s, name: trk["Name"], point: {pixelSize: 4, color: col},
				availability: new Cesium.TimeIntervalCollection(
					[new Cesium.TimeInterval({start: simStart, stop: simStop})]),
				position: new Cesium.CallbackProperty(updatePosition(CRFtoTRF, s), false)})
	}

	csView.entities.resumeEvents()
	$("#SearchBox").autocomplete({source: names, minLength: 3})
	window.document.getElementById("Loader").style.display = "none"
}

function updatePosition(CRFtoTRF, trkid)
{
	return(function UpdateHelper() {
		var ele = objectData[trkid]
		var t = Cesium.JulianDate.secondsDifference(csView.clock.currentTime, simStart)
		var u = jQuery.extend({}, ele)
		u.MeanAnom = (u.MeanAnom + u.mmo*t) % twoPi
		var eff = new Cesium.Cartesian3()
		var eci = stateVector(u, true, 1E-3)
		Cesium.Matrix3.multiplyByVector(CRFtoTRF, eci, eff)
		return(eff)
	})
}

function displayOrbit(obj, oemLink)
{
	var i, s, dsnsel = $("#DataSrcSelect").val()
	var car = new Cesium.Cartographic(), Y = new Cesium.Cartesian3()
	var CRFtoTRF = Cesium.Transforms.computeIcrfToFixedMatrix(simStart)

	obj.description = ""
	for (i = 0; i < orbitEntity.length; i++)
	{
		orbitEntity[i].polyline.width = 0
		orbitEntity[i].label.text = ""
	}
	orbitEntity = []

	i = 1
	for (s in objectData)
	{
		var same = objectData[s]
		if (dsnsel != "ALL" && dsnsel != same["DataSourceId"])
			continue
		if (s != obj.id && (same["NoradId"] == "" || same["NoradId"] != objectData[obj.id]["NoradId"]))
			continue

		var sta, arr = []
		var u = jQuery.extend({}, same)
		for (u.MeanAnom = 0; u.MeanAnom <= 6.29; u.MeanAnom += 0.01)
		{
			if (u.MeanAnom == 0)
			{
				var dsName = dataSources[same["DataSourceId"]]
				sta = stateVector(u, false, 1E-6, 100)
				Cesium.Matrix3.multiplyByVector(CRFtoTRF, sta.pos, Y)

				var htm = `<table border : 1px solid white style = "width:100%">`
				if (oemLink != "" && obj.description == "")
					htm += `<tr><td colspan="2" align="center">
			Click <a href=${oemLink} download style="color:blue">here</a> to download ephemeris</td></tr>`

				htm += `<tr><th align = "center" style = "color:white"><strong>Data Source</strong></th> 
			<th align = "center" style = "color:white"> <strong>(${i}) ${dsName}</strong></th></tr>`
				if (dsName.search("Astria OD") != -1)
				{
					var idx1 = dsName.indexOf("/") + 1
					var idx2 = dsName.lastIndexOf(" ")
					var link = `OD_stats/${dsName.slice(idx1, idx2)}_${same["NoradId"]}.html`
					htm += `<tr><td colspan="2" align="center">
			Click <a href=${link} target="_blank" style="color:blue">here</a> for orbit determination statistics</td></tr>`
				}

				infoFields.forEach (function(inf) {
					if (same[inf] != "")
						htm += `<tr><td>${inf}</td> <td align = "right">${same[inf]}</td></tr>`
				})

				if (same["DataSourceId"] != "7")
				{
					htm += `<tr><td>Data epoch</td><td align = "right">${same["Epoch"].substring(0, 24)}</td></tr>
		    	<tr><td>Semi-major axis</td><td align = "right">${(same.SMA/1000).toFixed(1)} km</td></tr>
		    	<tr><td>Eccentricity</td><td align = "right">${same.Ecc.toFixed(4)}</td></tr>
		    	<tr><td>Inclination</td><td align = "right">${(same.Inc*180/Math.PI).toFixed(4)}&deg;</td></tr>
		    	<tr><td>RA of ascending node</td><td align = "right">${(same.RAAN*180/Math.PI).toFixed(4)}&deg;</td></tr>
		    	<tr><td>Argument of perigee</td><td align = "right">${(same.ArgP*180/Math.PI).toFixed(4)}&deg;</td></tr>
		    	<tr><td>Mean motion</td><td align = "right">${(same.mmo*180/Math.PI).toFixed(4)}<sup>&deg;</sup>&frasl;<sub>s</sub></td></tr>
		    	<tr><td>Orbital speed</td><td align = "right">${(Cesium.Cartesian3.magnitude(sta.vel)/1000).toFixed(1)}
			<sup>km</sup>&frasl;<sub>s</sub></td></tr>
		    	<tr><td>Orbital period</td><td align = "right">${(Math.PI/(same.mmo*30)).toFixed(1)} min</td></tr>`
				}

				obj.description += htm
				if (same["DataSourceId"] == "7")
					break
			}
			else
			{
				sta = stateVector(u, true, 1E-6, 100)
				Cesium.Matrix3.multiplyByVector(CRFtoTRF, sta, Y)
			}

			csView.scene.mapProjection.ellipsoid.cartesianToCartographic(Y, car)
			if (Number.isNaN(car.longitude) || Number.isNaN(car.latitude) || Number.isNaN(car.height))
				continue
			arr.push(car.longitude, car.latitude, car.height)
		}

		if (same["DataSourceId"] == "7")
		{
			i++
			continue
		}

		var ent = csView.entities.getById(s)
		ent.polyline = {positions: Cesium.Cartesian3.fromRadiansArrayHeights(arr), width: 1, material: ent.point.color.getValue()}
		ent.label = {text: `${i}`, font: "12pt monospace", fillColor: Cesium.Color.YELLOW, backgroundColor: Cesium.Color.TRANSPARENT,
			showBackground: true, verticalOrigin: Cesium.VerticalOrigin.TOP, position: ent.position}
		orbitEntity.push(ent)
		i++
	}
}

function setCesiumHome()
{
	var homeLat = 30.3, homeLon = -97.7
	Cesium.Camera.DEFAULT_VIEW_RECTANGLE = Cesium.Rectangle.fromDegrees(homeLon, homeLat, homeLon+3, homeLat-3)
	Cesium.Camera.DEFAULT_VIEW_FACTOR = 3
}

function onTrackClick()
{
	if (Cesium.defined(csView.selectedEntity))
	{
		var id = objectData[csView.selectedEntity.id]["NoradId"]
		var link = `SP_ephemeris/${id.padStart(5, "0").substring(0, 2)}/${id}.oem.gz`
		csView.zoomTo(csView.selectedEntity, new Cesium.HeadingPitchRange(0, -Math.PI/2, 1E7)).then(function () {
			$.ajax({url: link, type: "HEAD", error: function() {displayOrbit(csView.selectedEntity, "")},
				success: function() {displayOrbit(csView.selectedEntity, link)}})
		})
	}
}

function onToggleDebris()
{
	window.document.getElementById("Loader").style.display = "inline"
	var cb = window.document.getElementById("DebrisToggle")
	if (cb.checked && !debrisLoaded)
	{
		debrisLoaded = true
		$.getScript("OD_stats/debrisData.js", function (data, status, jqxhr) {getSpaceObjects(debrisRso)})
	}
	else
		displayObjects()
}

$("#SearchBox").on("autocompleteselect", function (event, ui)
{
	event.preventDefault()
	this.value = ui.item.label
	csView.selectedEntity = csView.entities.getById(ui.item.value)
})

$("#TypeSelect").selectmenu({width: "100%", select: function (event, ui) {displayObjects()}})
$("#DataSrcSelect").selectmenu({width: "100%", select: function (event, ui) {displayObjects()}})
$("#OriginSelect").selectmenu({width: "100%", select: function (event, ui) {displayObjects()}})
$("#RegimeSelect").selectmenu({width: "100%", select: function (event, ui) {displayObjects()}})
$("#ConstellationSelect").selectmenu({width: "100%", select: function (event, ui) {displayObjects()}})

var recs = countryList.split(/\r\n|\n/)
for (var i = 0; i < recs.length; i++)
{
	fields = recs[i].split(/,/)
	if (fields.length == 2)
		$("#OriginSelect").append($("<option>", {value: fields[1], text: fields[0]}))
}

$("#OriginSelect").val("ALL")
$("#OriginSelect").selectmenu("refresh")

setCesiumHome()
Cesium.BingMapsApi.defaultKey = 'AvpcYMdwXvBkX6V51Yz9Lgfspl-qOUbaNkXhlMMiJCLuFxok3AeeV4-7d58kqCzY'
var csView = new Cesium.Viewer("MainDisplay", {
	imageryProvider: new Cesium.UrlTemplateImageryProvider({
		url: Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII") + "/{z}/{x}/{reverseY}.jpg", credit: "Analytical Graphics, Inc.",
		tilingScheme: new Cesium.GeographicTilingScheme(), maximumLevel: 2}),
	baseLayerPicker: true, geocoder: false, animation: true, timeline: true, homeButton: true, infoBox: true, sceneModePicker: true,
	navigationHelpButton: true, skyAtmosphere: false, skyBox: false, CreditDisplay: true, shouldAnimate: true, selectionIndicator: false})
csView.clock.startTime = simStart.clone()
csView.clock.stopTime = simStop.clone()
csView.clock.currentTime = simStart.clone()
csView.clock.clockRange = Cesium.ClockRange.CLAMPED
csView.clock.multiplier = 1
csView.timeline.zoomTo(simStart, simStop)
csView.selectedEntityChanged.addEventListener(onTrackClick)
csView.scene.globe.enableLighting = true
Cesium.Transforms.preloadIcrfFixed(new Cesium.TimeInterval({start: new Cesium.JulianDate(2415020.0),
	stop: new Cesium.JulianDate(2488070.0),})).then(function() {getDataSources();})
