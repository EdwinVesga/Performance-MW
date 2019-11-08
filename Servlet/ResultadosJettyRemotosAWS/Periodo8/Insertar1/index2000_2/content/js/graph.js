/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 92.0, "minX": 0.0, "maxY": 5298.0, "series": [{"data": [[0.0, 92.0], [0.1, 95.0], [0.2, 97.0], [0.3, 98.0], [0.4, 113.0], [0.5, 116.0], [0.6, 119.0], [0.7, 120.0], [0.8, 122.0], [0.9, 123.0], [1.0, 128.0], [1.1, 130.0], [1.2, 131.0], [1.3, 133.0], [1.4, 133.0], [1.5, 134.0], [1.6, 135.0], [1.7, 136.0], [1.8, 136.0], [1.9, 137.0], [2.0, 138.0], [2.1, 138.0], [2.2, 141.0], [2.3, 141.0], [2.4, 142.0], [2.5, 143.0], [2.6, 143.0], [2.7, 144.0], [2.8, 145.0], [2.9, 146.0], [3.0, 148.0], [3.1, 149.0], [3.2, 149.0], [3.3, 151.0], [3.4, 153.0], [3.5, 153.0], [3.6, 154.0], [3.7, 154.0], [3.8, 155.0], [3.9, 156.0], [4.0, 157.0], [4.1, 158.0], [4.2, 159.0], [4.3, 159.0], [4.4, 160.0], [4.5, 161.0], [4.6, 161.0], [4.7, 162.0], [4.8, 162.0], [4.9, 164.0], [5.0, 165.0], [5.1, 166.0], [5.2, 167.0], [5.3, 168.0], [5.4, 169.0], [5.5, 169.0], [5.6, 170.0], [5.7, 170.0], [5.8, 170.0], [5.9, 171.0], [6.0, 171.0], [6.1, 172.0], [6.2, 172.0], [6.3, 173.0], [6.4, 173.0], [6.5, 174.0], [6.6, 175.0], [6.7, 175.0], [6.8, 176.0], [6.9, 176.0], [7.0, 177.0], [7.1, 177.0], [7.2, 178.0], [7.3, 179.0], [7.4, 180.0], [7.5, 180.0], [7.6, 180.0], [7.7, 181.0], [7.8, 181.0], [7.9, 181.0], [8.0, 181.0], [8.1, 182.0], [8.2, 182.0], [8.3, 182.0], [8.4, 183.0], [8.5, 184.0], [8.6, 184.0], [8.7, 185.0], [8.8, 185.0], [8.9, 186.0], [9.0, 187.0], [9.1, 187.0], [9.2, 188.0], [9.3, 188.0], [9.4, 189.0], [9.5, 189.0], [9.6, 190.0], [9.7, 190.0], [9.8, 190.0], [9.9, 191.0], [10.0, 191.0], [10.1, 192.0], [10.2, 192.0], [10.3, 193.0], [10.4, 193.0], [10.5, 193.0], [10.6, 194.0], [10.7, 195.0], [10.8, 195.0], [10.9, 195.0], [11.0, 196.0], [11.1, 196.0], [11.2, 197.0], [11.3, 198.0], [11.4, 198.0], [11.5, 199.0], [11.6, 200.0], [11.7, 200.0], [11.8, 202.0], [11.9, 202.0], [12.0, 203.0], [12.1, 203.0], [12.2, 204.0], [12.3, 204.0], [12.4, 205.0], [12.5, 205.0], [12.6, 206.0], [12.7, 207.0], [12.8, 207.0], [12.9, 208.0], [13.0, 208.0], [13.1, 209.0], [13.2, 209.0], [13.3, 210.0], [13.4, 210.0], [13.5, 210.0], [13.6, 211.0], [13.7, 212.0], [13.8, 212.0], [13.9, 212.0], [14.0, 212.0], [14.1, 213.0], [14.2, 214.0], [14.3, 215.0], [14.4, 215.0], [14.5, 216.0], [14.6, 216.0], [14.7, 217.0], [14.8, 218.0], [14.9, 218.0], [15.0, 218.0], [15.1, 218.0], [15.2, 219.0], [15.3, 219.0], [15.4, 219.0], [15.5, 219.0], [15.6, 219.0], [15.7, 220.0], [15.8, 221.0], [15.9, 221.0], [16.0, 221.0], [16.1, 222.0], [16.2, 222.0], [16.3, 224.0], [16.4, 224.0], [16.5, 224.0], [16.6, 225.0], [16.7, 225.0], [16.8, 227.0], [16.9, 227.0], [17.0, 228.0], [17.1, 228.0], [17.2, 228.0], [17.3, 230.0], [17.4, 231.0], [17.5, 232.0], [17.6, 232.0], [17.7, 232.0], [17.8, 233.0], [17.9, 233.0], [18.0, 234.0], [18.1, 235.0], [18.2, 235.0], [18.3, 236.0], [18.4, 236.0], [18.5, 237.0], [18.6, 238.0], [18.7, 238.0], [18.8, 239.0], [18.9, 239.0], [19.0, 240.0], [19.1, 240.0], [19.2, 240.0], [19.3, 241.0], [19.4, 242.0], [19.5, 242.0], [19.6, 242.0], [19.7, 243.0], [19.8, 243.0], [19.9, 244.0], [20.0, 246.0], [20.1, 246.0], [20.2, 246.0], [20.3, 247.0], [20.4, 247.0], [20.5, 248.0], [20.6, 249.0], [20.7, 250.0], [20.8, 251.0], [20.9, 251.0], [21.0, 252.0], [21.1, 252.0], [21.2, 252.0], [21.3, 253.0], [21.4, 253.0], [21.5, 254.0], [21.6, 254.0], [21.7, 255.0], [21.8, 255.0], [21.9, 255.0], [22.0, 257.0], [22.1, 258.0], [22.2, 258.0], [22.3, 258.0], [22.4, 258.0], [22.5, 258.0], [22.6, 259.0], [22.7, 259.0], [22.8, 260.0], [22.9, 260.0], [23.0, 261.0], [23.1, 262.0], [23.2, 262.0], [23.3, 264.0], [23.4, 264.0], [23.5, 264.0], [23.6, 264.0], [23.7, 265.0], [23.8, 266.0], [23.9, 266.0], [24.0, 267.0], [24.1, 267.0], [24.2, 268.0], [24.3, 271.0], [24.4, 271.0], [24.5, 271.0], [24.6, 272.0], [24.7, 272.0], [24.8, 273.0], [24.9, 273.0], [25.0, 274.0], [25.1, 275.0], [25.2, 276.0], [25.3, 276.0], [25.4, 277.0], [25.5, 278.0], [25.6, 279.0], [25.7, 280.0], [25.8, 281.0], [25.9, 282.0], [26.0, 283.0], [26.1, 284.0], [26.2, 287.0], [26.3, 288.0], [26.4, 289.0], [26.5, 289.0], [26.6, 290.0], [26.7, 290.0], [26.8, 291.0], [26.9, 292.0], [27.0, 292.0], [27.1, 293.0], [27.2, 294.0], [27.3, 294.0], [27.4, 296.0], [27.5, 297.0], [27.6, 297.0], [27.7, 298.0], [27.8, 300.0], [27.9, 300.0], [28.0, 301.0], [28.1, 302.0], [28.2, 304.0], [28.3, 305.0], [28.4, 306.0], [28.5, 308.0], [28.6, 310.0], [28.7, 310.0], [28.8, 311.0], [28.9, 311.0], [29.0, 312.0], [29.1, 312.0], [29.2, 313.0], [29.3, 314.0], [29.4, 315.0], [29.5, 315.0], [29.6, 316.0], [29.7, 316.0], [29.8, 317.0], [29.9, 317.0], [30.0, 319.0], [30.1, 321.0], [30.2, 322.0], [30.3, 322.0], [30.4, 323.0], [30.5, 324.0], [30.6, 326.0], [30.7, 327.0], [30.8, 328.0], [30.9, 330.0], [31.0, 331.0], [31.1, 337.0], [31.2, 339.0], [31.3, 340.0], [31.4, 344.0], [31.5, 345.0], [31.6, 345.0], [31.7, 345.0], [31.8, 347.0], [31.9, 347.0], [32.0, 349.0], [32.1, 351.0], [32.2, 354.0], [32.3, 354.0], [32.4, 356.0], [32.5, 357.0], [32.6, 361.0], [32.7, 362.0], [32.8, 362.0], [32.9, 362.0], [33.0, 363.0], [33.1, 364.0], [33.2, 365.0], [33.3, 366.0], [33.4, 369.0], [33.5, 371.0], [33.6, 375.0], [33.7, 378.0], [33.8, 378.0], [33.9, 382.0], [34.0, 383.0], [34.1, 384.0], [34.2, 388.0], [34.3, 389.0], [34.4, 391.0], [34.5, 395.0], [34.6, 398.0], [34.7, 401.0], [34.8, 405.0], [34.9, 408.0], [35.0, 414.0], [35.1, 415.0], [35.2, 419.0], [35.3, 423.0], [35.4, 427.0], [35.5, 429.0], [35.6, 439.0], [35.7, 452.0], [35.8, 462.0], [35.9, 474.0], [36.0, 484.0], [36.1, 495.0], [36.2, 508.0], [36.3, 537.0], [36.4, 557.0], [36.5, 585.0], [36.6, 645.0], [36.7, 649.0], [36.8, 678.0], [36.9, 689.0], [37.0, 700.0], [37.1, 704.0], [37.2, 719.0], [37.3, 733.0], [37.4, 744.0], [37.5, 753.0], [37.6, 758.0], [37.7, 763.0], [37.8, 778.0], [37.9, 784.0], [38.0, 793.0], [38.1, 795.0], [38.2, 804.0], [38.3, 821.0], [38.4, 839.0], [38.5, 845.0], [38.6, 856.0], [38.7, 865.0], [38.8, 876.0], [38.9, 880.0], [39.0, 885.0], [39.1, 887.0], [39.2, 894.0], [39.3, 895.0], [39.4, 901.0], [39.5, 905.0], [39.6, 908.0], [39.7, 913.0], [39.8, 916.0], [39.9, 928.0], [40.0, 928.0], [40.1, 929.0], [40.2, 931.0], [40.3, 934.0], [40.4, 937.0], [40.5, 939.0], [40.6, 945.0], [40.7, 951.0], [40.8, 953.0], [40.9, 953.0], [41.0, 962.0], [41.1, 966.0], [41.2, 968.0], [41.3, 975.0], [41.4, 982.0], [41.5, 991.0], [41.6, 992.0], [41.7, 994.0], [41.8, 995.0], [41.9, 1000.0], [42.0, 1005.0], [42.1, 1012.0], [42.2, 1014.0], [42.3, 1016.0], [42.4, 1024.0], [42.5, 1027.0], [42.6, 1028.0], [42.7, 1036.0], [42.8, 1040.0], [42.9, 1044.0], [43.0, 1045.0], [43.1, 1052.0], [43.2, 1055.0], [43.3, 1060.0], [43.4, 1064.0], [43.5, 1065.0], [43.6, 1068.0], [43.7, 1074.0], [43.8, 1078.0], [43.9, 1080.0], [44.0, 1084.0], [44.1, 1086.0], [44.2, 1089.0], [44.3, 1095.0], [44.4, 1099.0], [44.5, 1102.0], [44.6, 1113.0], [44.7, 1114.0], [44.8, 1116.0], [44.9, 1119.0], [45.0, 1126.0], [45.1, 1130.0], [45.2, 1143.0], [45.3, 1151.0], [45.4, 1154.0], [45.5, 1162.0], [45.6, 1165.0], [45.7, 1167.0], [45.8, 1168.0], [45.9, 1174.0], [46.0, 1177.0], [46.1, 1187.0], [46.2, 1191.0], [46.3, 1193.0], [46.4, 1198.0], [46.5, 1200.0], [46.6, 1206.0], [46.7, 1209.0], [46.8, 1210.0], [46.9, 1212.0], [47.0, 1218.0], [47.1, 1219.0], [47.2, 1222.0], [47.3, 1233.0], [47.4, 1234.0], [47.5, 1241.0], [47.6, 1249.0], [47.7, 1251.0], [47.8, 1257.0], [47.9, 1260.0], [48.0, 1261.0], [48.1, 1267.0], [48.2, 1271.0], [48.3, 1273.0], [48.4, 1274.0], [48.5, 1278.0], [48.6, 1287.0], [48.7, 1294.0], [48.8, 1301.0], [48.9, 1304.0], [49.0, 1306.0], [49.1, 1312.0], [49.2, 1314.0], [49.3, 1318.0], [49.4, 1322.0], [49.5, 1327.0], [49.6, 1330.0], [49.7, 1335.0], [49.8, 1344.0], [49.9, 1351.0], [50.0, 1363.0], [50.1, 1366.0], [50.2, 1369.0], [50.3, 1374.0], [50.4, 1375.0], [50.5, 1376.0], [50.6, 1380.0], [50.7, 1385.0], [50.8, 1390.0], [50.9, 1392.0], [51.0, 1394.0], [51.1, 1398.0], [51.2, 1402.0], [51.3, 1408.0], [51.4, 1412.0], [51.5, 1414.0], [51.6, 1416.0], [51.7, 1431.0], [51.8, 1439.0], [51.9, 1443.0], [52.0, 1449.0], [52.1, 1456.0], [52.2, 1458.0], [52.3, 1462.0], [52.4, 1465.0], [52.5, 1465.0], [52.6, 1468.0], [52.7, 1473.0], [52.8, 1477.0], [52.9, 1479.0], [53.0, 1492.0], [53.1, 1505.0], [53.2, 1506.0], [53.3, 1508.0], [53.4, 1512.0], [53.5, 1515.0], [53.6, 1518.0], [53.7, 1520.0], [53.8, 1525.0], [53.9, 1529.0], [54.0, 1531.0], [54.1, 1535.0], [54.2, 1537.0], [54.3, 1539.0], [54.4, 1540.0], [54.5, 1543.0], [54.6, 1546.0], [54.7, 1548.0], [54.8, 1553.0], [54.9, 1557.0], [55.0, 1558.0], [55.1, 1563.0], [55.2, 1563.0], [55.3, 1568.0], [55.4, 1572.0], [55.5, 1574.0], [55.6, 1577.0], [55.7, 1579.0], [55.8, 1582.0], [55.9, 1586.0], [56.0, 1588.0], [56.1, 1601.0], [56.2, 1602.0], [56.3, 1607.0], [56.4, 1607.0], [56.5, 1613.0], [56.6, 1621.0], [56.7, 1629.0], [56.8, 1634.0], [56.9, 1641.0], [57.0, 1644.0], [57.1, 1645.0], [57.2, 1649.0], [57.3, 1651.0], [57.4, 1655.0], [57.5, 1657.0], [57.6, 1661.0], [57.7, 1661.0], [57.8, 1664.0], [57.9, 1666.0], [58.0, 1671.0], [58.1, 1673.0], [58.2, 1676.0], [58.3, 1678.0], [58.4, 1679.0], [58.5, 1683.0], [58.6, 1685.0], [58.7, 1688.0], [58.8, 1690.0], [58.9, 1691.0], [59.0, 1694.0], [59.1, 1694.0], [59.2, 1706.0], [59.3, 1711.0], [59.4, 1711.0], [59.5, 1716.0], [59.6, 1718.0], [59.7, 1722.0], [59.8, 1724.0], [59.9, 1727.0], [60.0, 1730.0], [60.1, 1734.0], [60.2, 1737.0], [60.3, 1746.0], [60.4, 1750.0], [60.5, 1751.0], [60.6, 1753.0], [60.7, 1756.0], [60.8, 1759.0], [60.9, 1766.0], [61.0, 1767.0], [61.1, 1769.0], [61.2, 1774.0], [61.3, 1775.0], [61.4, 1777.0], [61.5, 1780.0], [61.6, 1788.0], [61.7, 1790.0], [61.8, 1791.0], [61.9, 1794.0], [62.0, 1796.0], [62.1, 1803.0], [62.2, 1809.0], [62.3, 1810.0], [62.4, 1815.0], [62.5, 1817.0], [62.6, 1818.0], [62.7, 1819.0], [62.8, 1827.0], [62.9, 1830.0], [63.0, 1833.0], [63.1, 1837.0], [63.2, 1841.0], [63.3, 1845.0], [63.4, 1848.0], [63.5, 1855.0], [63.6, 1860.0], [63.7, 1861.0], [63.8, 1870.0], [63.9, 1874.0], [64.0, 1875.0], [64.1, 1878.0], [64.2, 1883.0], [64.3, 1889.0], [64.4, 1890.0], [64.5, 1893.0], [64.6, 1899.0], [64.7, 1905.0], [64.8, 1908.0], [64.9, 1913.0], [65.0, 1916.0], [65.1, 1923.0], [65.2, 1928.0], [65.3, 1931.0], [65.4, 1940.0], [65.5, 1940.0], [65.6, 1949.0], [65.7, 1953.0], [65.8, 1956.0], [65.9, 1959.0], [66.0, 1960.0], [66.1, 1961.0], [66.2, 1967.0], [66.3, 1968.0], [66.4, 1970.0], [66.5, 1973.0], [66.6, 1974.0], [66.7, 1974.0], [66.8, 1977.0], [66.9, 1986.0], [67.0, 1988.0], [67.1, 1988.0], [67.2, 1992.0], [67.3, 1992.0], [67.4, 1994.0], [67.5, 1996.0], [67.6, 1996.0], [67.7, 1999.0], [67.8, 2000.0], [67.9, 2003.0], [68.0, 2005.0], [68.1, 2007.0], [68.2, 2012.0], [68.3, 2020.0], [68.4, 2022.0], [68.5, 2023.0], [68.6, 2027.0], [68.7, 2033.0], [68.8, 2036.0], [68.9, 2039.0], [69.0, 2042.0], [69.1, 2044.0], [69.2, 2045.0], [69.3, 2048.0], [69.4, 2054.0], [69.5, 2055.0], [69.6, 2058.0], [69.7, 2063.0], [69.8, 2066.0], [69.9, 2067.0], [70.0, 2068.0], [70.1, 2069.0], [70.2, 2072.0], [70.3, 2076.0], [70.4, 2080.0], [70.5, 2081.0], [70.6, 2088.0], [70.7, 2091.0], [70.8, 2094.0], [70.9, 2099.0], [71.0, 2099.0], [71.1, 2104.0], [71.2, 2108.0], [71.3, 2111.0], [71.4, 2115.0], [71.5, 2117.0], [71.6, 2123.0], [71.7, 2123.0], [71.8, 2124.0], [71.9, 2128.0], [72.0, 2128.0], [72.1, 2135.0], [72.2, 2137.0], [72.3, 2139.0], [72.4, 2143.0], [72.5, 2145.0], [72.6, 2148.0], [72.7, 2154.0], [72.8, 2155.0], [72.9, 2163.0], [73.0, 2165.0], [73.1, 2166.0], [73.2, 2169.0], [73.3, 2171.0], [73.4, 2172.0], [73.5, 2176.0], [73.6, 2179.0], [73.7, 2182.0], [73.8, 2186.0], [73.9, 2193.0], [74.0, 2195.0], [74.1, 2200.0], [74.2, 2202.0], [74.3, 2210.0], [74.4, 2213.0], [74.5, 2219.0], [74.6, 2223.0], [74.7, 2225.0], [74.8, 2228.0], [74.9, 2232.0], [75.0, 2235.0], [75.1, 2239.0], [75.2, 2242.0], [75.3, 2248.0], [75.4, 2253.0], [75.5, 2257.0], [75.6, 2259.0], [75.7, 2263.0], [75.8, 2265.0], [75.9, 2266.0], [76.0, 2268.0], [76.1, 2270.0], [76.2, 2278.0], [76.3, 2281.0], [76.4, 2284.0], [76.5, 2287.0], [76.6, 2289.0], [76.7, 2291.0], [76.8, 2293.0], [76.9, 2295.0], [77.0, 2296.0], [77.1, 2301.0], [77.2, 2305.0], [77.3, 2307.0], [77.4, 2311.0], [77.5, 2317.0], [77.6, 2325.0], [77.7, 2328.0], [77.8, 2330.0], [77.9, 2332.0], [78.0, 2334.0], [78.1, 2335.0], [78.2, 2336.0], [78.3, 2336.0], [78.4, 2340.0], [78.5, 2343.0], [78.6, 2344.0], [78.7, 2347.0], [78.8, 2351.0], [78.9, 2354.0], [79.0, 2356.0], [79.1, 2359.0], [79.2, 2366.0], [79.3, 2372.0], [79.4, 2374.0], [79.5, 2376.0], [79.6, 2379.0], [79.7, 2379.0], [79.8, 2381.0], [79.9, 2385.0], [80.0, 2386.0], [80.1, 2389.0], [80.2, 2389.0], [80.3, 2391.0], [80.4, 2393.0], [80.5, 2396.0], [80.6, 2399.0], [80.7, 2403.0], [80.8, 2407.0], [80.9, 2409.0], [81.0, 2411.0], [81.1, 2417.0], [81.2, 2423.0], [81.3, 2432.0], [81.4, 2440.0], [81.5, 2440.0], [81.6, 2449.0], [81.7, 2457.0], [81.8, 2465.0], [81.9, 2470.0], [82.0, 2474.0], [82.1, 2480.0], [82.2, 2481.0], [82.3, 2482.0], [82.4, 2483.0], [82.5, 2489.0], [82.6, 2490.0], [82.7, 2493.0], [82.8, 2494.0], [82.9, 2501.0], [83.0, 2502.0], [83.1, 2503.0], [83.2, 2508.0], [83.3, 2510.0], [83.4, 2512.0], [83.5, 2516.0], [83.6, 2518.0], [83.7, 2520.0], [83.8, 2521.0], [83.9, 2522.0], [84.0, 2523.0], [84.1, 2528.0], [84.2, 2534.0], [84.3, 2540.0], [84.4, 2542.0], [84.5, 2543.0], [84.6, 2544.0], [84.7, 2556.0], [84.8, 2560.0], [84.9, 2563.0], [85.0, 2568.0], [85.1, 2576.0], [85.2, 2579.0], [85.3, 2582.0], [85.4, 2591.0], [85.5, 2594.0], [85.6, 2605.0], [85.7, 2612.0], [85.8, 2613.0], [85.9, 2618.0], [86.0, 2620.0], [86.1, 2622.0], [86.2, 2626.0], [86.3, 2627.0], [86.4, 2633.0], [86.5, 2634.0], [86.6, 2635.0], [86.7, 2637.0], [86.8, 2640.0], [86.9, 2645.0], [87.0, 2649.0], [87.1, 2662.0], [87.2, 2667.0], [87.3, 2682.0], [87.4, 2687.0], [87.5, 2687.0], [87.6, 2689.0], [87.7, 2700.0], [87.8, 2704.0], [87.9, 2711.0], [88.0, 2715.0], [88.1, 2716.0], [88.2, 2723.0], [88.3, 2732.0], [88.4, 2734.0], [88.5, 2741.0], [88.6, 2746.0], [88.7, 2766.0], [88.8, 2775.0], [88.9, 2778.0], [89.0, 2779.0], [89.1, 2793.0], [89.2, 2795.0], [89.3, 2803.0], [89.4, 2814.0], [89.5, 2824.0], [89.6, 2837.0], [89.7, 2840.0], [89.8, 2855.0], [89.9, 2859.0], [90.0, 2865.0], [90.1, 2872.0], [90.2, 2878.0], [90.3, 2884.0], [90.4, 2895.0], [90.5, 2902.0], [90.6, 2906.0], [90.7, 2909.0], [90.8, 2913.0], [90.9, 2915.0], [91.0, 2915.0], [91.1, 2922.0], [91.2, 2925.0], [91.3, 2929.0], [91.4, 2931.0], [91.5, 2933.0], [91.6, 2949.0], [91.7, 2959.0], [91.8, 2963.0], [91.9, 2966.0], [92.0, 2993.0], [92.1, 2998.0], [92.2, 3021.0], [92.3, 3022.0], [92.4, 3026.0], [92.5, 3034.0], [92.6, 3054.0], [92.7, 3064.0], [92.8, 3068.0], [92.9, 3069.0], [93.0, 3082.0], [93.1, 3095.0], [93.2, 3098.0], [93.3, 3112.0], [93.4, 3116.0], [93.5, 3129.0], [93.6, 3130.0], [93.7, 3140.0], [93.8, 3152.0], [93.9, 3158.0], [94.0, 3167.0], [94.1, 3174.0], [94.2, 3182.0], [94.3, 3184.0], [94.4, 3195.0], [94.5, 3216.0], [94.6, 3219.0], [94.7, 3220.0], [94.8, 3226.0], [94.9, 3228.0], [95.0, 3236.0], [95.1, 3250.0], [95.2, 3266.0], [95.3, 3275.0], [95.4, 3276.0], [95.5, 3281.0], [95.6, 3282.0], [95.7, 3293.0], [95.8, 3305.0], [95.9, 3321.0], [96.0, 3324.0], [96.1, 3334.0], [96.2, 3350.0], [96.3, 3354.0], [96.4, 3382.0], [96.5, 3409.0], [96.6, 3425.0], [96.7, 3460.0], [96.8, 3462.0], [96.9, 3485.0], [97.0, 3506.0], [97.1, 3518.0], [97.2, 3523.0], [97.3, 3538.0], [97.4, 3552.0], [97.5, 3557.0], [97.6, 3565.0], [97.7, 3570.0], [97.8, 3577.0], [97.9, 3587.0], [98.0, 3600.0], [98.1, 3610.0], [98.2, 3619.0], [98.3, 3640.0], [98.4, 3662.0], [98.5, 3680.0], [98.6, 3735.0], [98.7, 3747.0], [98.8, 3786.0], [98.9, 3809.0], [99.0, 3831.0], [99.1, 3842.0], [99.2, 3884.0], [99.3, 3933.0], [99.4, 4023.0], [99.5, 4119.0], [99.6, 4132.0], [99.7, 4224.0], [99.8, 4330.0], [99.9, 4412.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 325.0, "series": [{"data": [[0.0, 7.0], [600.0, 8.0], [700.0, 24.0], [800.0, 23.0], [900.0, 50.0], [1000.0, 52.0], [1100.0, 41.0], [1200.0, 46.0], [1300.0, 47.0], [1400.0, 39.0], [1500.0, 60.0], [100.0, 224.0], [1600.0, 61.0], [1700.0, 58.0], [1800.0, 53.0], [1900.0, 61.0], [2000.0, 66.0], [2100.0, 61.0], [2200.0, 60.0], [2300.0, 71.0], [2400.0, 45.0], [2500.0, 53.0], [2600.0, 43.0], [2700.0, 32.0], [2800.0, 24.0], [2900.0, 33.0], [3000.0, 22.0], [3100.0, 24.0], [200.0, 325.0], [3200.0, 26.0], [3300.0, 15.0], [3400.0, 9.0], [3500.0, 21.0], [3700.0, 7.0], [3600.0, 11.0], [3800.0, 7.0], [3900.0, 3.0], [4000.0, 2.0], [4200.0, 3.0], [4100.0, 3.0], [4300.0, 2.0], [4400.0, 1.0], [300.0, 137.0], [5200.0, 1.0], [400.0, 30.0], [500.0, 9.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 5200.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 339.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 938.0, "series": [{"data": [[1.0, 339.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 723.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 938.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 245.06449999999995, "minX": 1.5496077E12, "maxY": 245.06449999999995, "series": [{"data": [[1.5496077E12, 245.06449999999995]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496077E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 173.89999999999998, "minX": 1.0, "maxY": 4412.0, "series": [{"data": [[2.0, 2649.0], [3.0, 2204.0], [5.0, 2679.0], [6.0, 2405.0], [7.0, 2931.0], [8.0, 2483.0], [10.0, 2402.5], [11.0, 2440.0], [13.0, 2370.0], [14.0, 2293.0], [15.0, 2618.0], [16.0, 2544.0], [17.0, 2859.0], [19.0, 2388.0], [20.0, 3021.0], [21.0, 2310.0], [22.0, 2647.0], [23.0, 2375.0], [24.0, 2508.0], [25.0, 2482.0], [26.0, 2512.0], [27.0, 574.6666666666666], [28.0, 567.0], [29.0, 332.81818181818187], [30.0, 361.3529411764706], [31.0, 485.5454545454545], [33.0, 695.8], [32.0, 580.8], [35.0, 173.89999999999998], [34.0, 664.0], [37.0, 424.77777777777777], [36.0, 609.0833333333333], [39.0, 302.2727272727273], [38.0, 277.6296296296297], [41.0, 298.3225806451613], [40.0, 311.47826086956525], [43.0, 302.7619047619048], [42.0, 317.95833333333337], [45.0, 330.6153846153846], [44.0, 354.35294117647067], [47.0, 462.55555555555554], [46.0, 370.34999999999997], [49.0, 367.21428571428567], [48.0, 379.4], [51.0, 299.2], [50.0, 337.5769230769231], [53.0, 458.66666666666663], [52.0, 346.71428571428567], [55.0, 391.0], [54.0, 368.10526315789474], [57.0, 348.91428571428565], [56.0, 331.5333333333333], [59.0, 391.3809523809523], [58.0, 407.30769230769226], [61.0, 508.8888888888888], [60.0, 446.6363636363637], [63.0, 997.0], [62.0, 556.9], [67.0, 293.5], [66.0, 1217.0], [65.0, 989.75], [64.0, 869.0], [68.0, 940.3333333333333], [69.0, 485.25], [71.0, 534.6666666666667], [70.0, 539.0], [74.0, 448.391304347826], [73.0, 650.2857142857142], [75.0, 519.8000000000001], [72.0, 319.9090909090909], [76.0, 784.8571428571429], [77.0, 904.0], [79.0, 1727.5], [78.0, 1473.0], [80.0, 736.25], [81.0, 943.75], [82.0, 1330.3333333333335], [83.0, 3425.0], [87.0, 4231.0], [85.0, 3541.0], [84.0, 3354.0], [91.0, 2862.0], [90.0, 2768.0], [89.0, 2091.0], [88.0, 2525.0], [95.0, 2374.0], [94.0, 3565.0], [93.0, 3587.0], [92.0, 3234.0], [99.0, 4023.0], [98.0, 3720.0], [97.0, 3263.0], [96.0, 3831.0], [103.0, 2664.0], [102.0, 2633.0], [101.0, 3170.0], [100.0, 3828.0], [107.0, 3220.0], [106.0, 4339.0], [105.0, 3350.0], [104.0, 3610.0], [111.0, 3751.0], [109.0, 2966.0], [108.0, 3301.0], [115.0, 3152.0], [114.0, 3282.0], [113.0, 3167.0], [112.0, 3266.0], [119.0, 3883.0], [118.0, 2746.0], [117.0, 3552.0], [116.0, 3321.0], [123.0, 3514.0], [122.0, 3617.0], [121.0, 2915.0], [120.0, 3680.0], [127.0, 2914.0], [126.0, 2793.0], [125.0, 4119.0], [124.0, 3593.0], [135.0, 3923.0], [134.0, 3064.0], [133.0, 3555.0], [132.0, 4412.0], [131.0, 3538.0], [130.0, 3570.0], [129.0, 3884.0], [128.0, 3114.0], [143.0, 1602.0], [142.0, 2135.0], [141.0, 2116.0], [140.0, 1732.0], [139.0, 1878.0], [138.0, 1819.0], [137.0, 1703.0], [136.0, 2959.0], [151.0, 2021.0], [150.0, 1678.0], [149.0, 1666.0], [148.0, 1711.0], [147.0, 2067.0], [146.0, 1818.0], [145.0, 2687.0], [144.0, 1664.0], [159.0, 1563.0], [158.0, 1887.0], [157.0, 1787.0], [156.0, 2517.0], [155.0, 1877.0], [154.0, 1995.5], [152.0, 1803.0], [167.0, 2099.0], [166.0, 1691.0], [165.0, 1607.0], [164.0, 2176.0], [163.0, 1721.0], [162.0, 2313.0], [161.0, 2381.0], [160.0, 1974.0], [175.0, 2620.0], [174.0, 1613.0], [173.0, 2146.0], [172.0, 2063.0], [171.0, 1666.0], [170.0, 1893.0], [169.0, 2687.0], [168.0, 1548.0], [183.0, 2269.5], [181.0, 1792.0], [180.0, 2143.0], [179.0, 1579.0], [178.0, 2128.0], [177.0, 2353.0], [176.0, 1710.0], [191.0, 1991.0], [189.0, 1578.0], [188.0, 1834.0], [186.0, 1831.5], [184.0, 1752.0], [199.0, 2219.0], [198.0, 1525.0], [197.0, 2523.0], [196.0, 2141.0], [195.0, 2016.0], [194.0, 2000.0], [193.0, 2467.0], [192.0, 1746.0], [207.0, 1413.0], [206.0, 926.0], [205.0, 2235.0], [204.0, 1994.0], [202.0, 2307.0], [200.0, 1492.0], [210.0, 1094.4], [209.0, 1046.5], [208.0, 993.5], [211.0, 934.5], [214.0, 859.0], [215.0, 1584.3333333333333], [213.0, 1650.0], [212.0, 1972.0], [217.0, 1311.6666666666667], [218.0, 1497.5], [219.0, 1688.5], [220.0, 1314.5], [223.0, 1445.0], [222.0, 1393.0], [221.0, 2023.0], [216.0, 1946.0], [225.0, 947.0], [227.0, 1499.75], [226.0, 1389.5], [224.0, 1333.0], [231.0, 1488.6666666666665], [230.0, 1755.5], [229.0, 1584.0], [228.0, 1838.0], [234.0, 1247.3333333333333], [233.0, 1509.5], [239.0, 1532.3333333333333], [238.0, 2354.0], [237.0, 1586.0], [236.0, 1928.0], [235.0, 1861.0], [232.0, 2613.0], [246.0, 1712.5], [247.0, 1326.5], [245.0, 2165.0], [244.0, 2086.0], [242.0, 1643.0], [241.0, 2275.5], [250.0, 1689.5], [252.0, 1685.5], [255.0, 2656.0], [253.0, 2094.0], [251.0, 2530.0], [249.0, 1775.0], [248.0, 3070.0], [270.0, 1442.6666666666665], [256.0, 1453.75], [262.0, 1424.5], [261.0, 2470.0], [260.0, 1947.0], [263.0, 2169.0], [265.0, 1500.5], [269.0, 1516.6666666666667], [271.0, 1769.0], [264.0, 3331.0], [268.0, 1449.0], [258.0, 1683.0], [267.0, 2200.0], [266.0, 2579.0], [274.0, 1312.125], [272.0, 1164.5], [275.0, 1363.875], [284.0, 1043.75], [286.0, 1266.5], [287.0, 1303.75], [285.0, 1394.2], [273.0, 1266.7777777777778], [278.0, 1771.0], [277.0, 2925.0], [276.0, 1843.0], [280.0, 2247.5], [279.0, 1846.5], [281.0, 1037.5714285714287], [282.0, 1008.3], [283.0, 1151.375], [301.0, 1538.0], [289.0, 1419.6], [288.0, 990.6666666666666], [290.0, 1217.2], [292.0, 1978.3333333333335], [294.0, 1832.0], [293.0, 1827.0], [295.0, 2295.0], [299.0, 1610.5], [298.0, 2006.0], [297.0, 2334.0], [296.0, 3275.0], [303.0, 1973.0], [302.0, 3024.0], [300.0, 2344.0], [291.0, 2102.0], [305.0, 1344.3333333333333], [304.0, 1246.857142857143], [306.0, 1419.75], [307.0, 1592.75], [310.0, 1616.0], [309.0, 2378.0], [308.0, 1667.0], [311.0, 1158.8333333333333], [319.0, 1325.0], [312.0, 2911.0], [315.0, 2069.0], [314.0, 1995.0], [318.0, 1695.0], [317.0, 2155.0], [316.0, 3283.0], [332.0, 1730.8], [320.0, 2020.0], [322.0, 2188.0], [323.0, 2232.0], [324.0, 1345.5], [325.0, 1680.5], [326.0, 1539.6666666666665], [327.0, 2389.0], [329.0, 2117.0], [331.0, 1241.0], [330.0, 2591.0], [334.0, 1920.0], [333.0, 2510.0], [335.0, 2019.0], [328.0, 2682.0], [349.0, 793.0], [336.0, 1599.0], [337.0, 2100.0], [338.0, 1984.0], [348.0, 2057.0], [339.0, 2720.0], [340.0, 1402.6666666666667], [341.0, 3279.0], [345.0, 2014.5], [344.0, 1617.0], [343.0, 1457.5], [342.0, 1484.0], [346.0, 784.0], [347.0, 1762.3333333333333], [351.0, 1545.5], [350.0, 2340.5], [366.0, 1628.5], [358.0, 1669.5], [357.0, 2898.0], [356.0, 3184.0], [359.0, 1615.4], [361.0, 2116.0], [360.0, 1658.0], [365.0, 1649.0], [367.0, 2035.5], [364.0, 2155.0], [355.0, 1686.0], [354.0, 1855.0], [353.0, 2334.0], [352.0, 1889.0], [363.0, 3461.0], [362.0, 3787.0], [381.0, 1974.5], [368.0, 1504.0], [371.0, 1608.75], [370.0, 2225.0], [369.0, 2644.0], [372.0, 2064.0], [373.0, 2085.0], [375.0, 2252.0], [374.0, 2049.0], [377.0, 1838.5], [376.0, 2311.0], [379.0, 2046.0], [378.0, 2902.0], [383.0, 1881.3333333333333], [382.0, 2857.0], [380.0, 1734.0], [385.0, 1822.5], [384.0, 1816.5], [386.0, 2040.0], [387.0, 1851.0], [396.0, 1886.0], [399.0, 2051.5], [398.0, 2283.0], [397.0, 3485.0], [388.0, 2243.5], [389.0, 2177.5], [390.0, 1773.3333333333333], [392.0, 1907.8], [391.0, 1677.5714285714287], [393.0, 2093.0], [394.0, 1587.0], [395.0, 2410.5], [401.0, 1966.3333333333333], [400.0, 1761.5], [402.0, 1675.2], [404.0, 1502.7142857142858], [405.0, 1419.8333333333333], [403.0, 2439.5], [406.0, 2165.6666666666665], [407.0, 2267.8], [410.0, 1652.3], [411.0, 1432.0], [409.0, 1452.9], [408.0, 2106.75], [415.0, 2329.0], [414.0, 1894.0], [413.0, 2626.0], [412.0, 2301.0], [423.0, 1801.1], [421.0, 1965.0], [420.0, 2355.0], [422.0, 1746.0], [424.0, 2081.285714285714], [425.0, 1928.5], [426.0, 1943.75], [427.0, 1965.3333333333335], [428.0, 1999.6666666666667], [419.0, 3520.0], [418.0, 1815.0], [417.0, 2385.0], [416.0, 3619.0], [430.0, 2790.5], [429.0, 2556.0], [431.0, 2191.25], [432.0, 2458.0], [434.0, 2628.0], [433.0, 3282.0], [435.0, 2733.0], [444.0, 1795.6000000000001], [445.0, 2119.0], [446.0, 2572.0], [447.0, 2197.166666666667], [437.0, 2163.583333333333], [436.0, 1685.0], [438.0, 2011.875], [440.0, 1866.3333333333333], [439.0, 2172.5], [441.0, 2087.0], [443.0, 2215.8], [442.0, 2028.5], [448.0, 2341.5], [454.0, 2057.0], [453.0, 1980.8], [452.0, 2073.2], [451.0, 2502.6], [455.0, 1689.3333333333333], [450.0, 2219.75], [456.0, 2420.0], [460.0, 2783.0], [461.0, 1951.0], [462.0, 2811.25], [463.0, 1997.0], [457.0, 2552.0], [459.0, 2417.0], [458.0, 1988.0], [476.0, 2515.571428571429], [464.0, 2510.3333333333335], [467.0, 2520.5], [466.0, 3236.0], [465.0, 2605.0], [477.0, 2040.0], [479.0, 1901.8], [478.0, 2222.5], [470.0, 2138.125], [469.0, 1941.6], [468.0, 1992.0], [472.0, 1830.25], [474.0, 2110.0], [475.0, 2070.533333333333], [473.0, 2337.6666666666665], [471.0, 2125.2], [492.0, 2152.6], [481.0, 3096.5], [480.0, 2665.0], [487.0, 2408.0], [482.0, 2183.0], [483.0, 3096.0], [485.0, 2268.5], [484.0, 3735.0], [486.0, 2454.0], [490.0, 2277.0], [491.0, 1995.0], [495.0, 1507.6666666666667], [489.0, 2534.0], [488.0, 2778.0], [494.0, 2049.3333333333335], [493.0, 2519.0], [498.0, 1762.25], [496.0, 2815.6666666666665], [497.0, 1706.0], [499.0, 2230.6666666666665], [508.0, 2097.0], [510.0, 2043.0], [509.0, 2639.0], [511.0, 1557.0], [500.0, 1890.75], [501.0, 2669.6666666666665], [504.0, 2199.75], [503.0, 1952.875], [502.0, 2003.0000000000002], [506.0, 2315.25], [507.0, 1673.0], [505.0, 2242.4], [518.0, 2013.0], [514.0, 2500.5], [513.0, 2133.5], [512.0, 1688.0], [527.0, 2214.25], [526.0, 2145.2], [525.0, 2392.4], [522.0, 1576.0], [523.0, 2209.25], [524.0, 2632.777777777778], [516.0, 2136.3333333333335], [515.0, 2272.6666666666665], [517.0, 2320.4], [519.0, 2215.5], [536.0, 2734.75], [538.0, 2421.1666666666665], [540.0, 1871.4], [541.0, 1612.0], [543.0, 2387.0], [542.0, 1593.3333333333333], [539.0, 1877.375], [537.0, 2479.0], [528.0, 2465.625], [533.0, 2292.0], [534.0, 1707.6666666666667], [535.0, 2269.4], [532.0, 1946.3333333333333], [531.0, 2731.571428571429], [530.0, 2568.0], [529.0, 1923.0], [520.0, 2197.5333333333338], [521.0, 1996.583333333333], [544.0, 2102.6666666666665], [546.0, 2108.0], [545.0, 2296.5], [1.0, 2474.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[245.06449999999995, 1392.519499999999]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 546.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 8400.0, "minX": 1.5496077E12, "maxY": 13998.483333333334, "series": [{"data": [[1.5496077E12, 13998.483333333334]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5496077E12, 8400.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496077E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 1392.519499999999, "minX": 1.5496077E12, "maxY": 1392.519499999999, "series": [{"data": [[1.5496077E12, 1392.519499999999]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496077E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 1392.5104999999983, "minX": 1.5496077E12, "maxY": 1392.5104999999983, "series": [{"data": [[1.5496077E12, 1392.5104999999983]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496077E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 35.39200000000001, "minX": 1.5496077E12, "maxY": 35.39200000000001, "series": [{"data": [[1.5496077E12, 35.39200000000001]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496077E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 92.0, "minX": 1.5496077E12, "maxY": 5298.0, "series": [{"data": [[1.5496077E12, 5298.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5496077E12, 92.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5496077E12, 2864.7000000000003]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5496077E12, 3830.9700000000003]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5496077E12, 3235.8999999999996]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496077E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 1360.0, "minX": 33.0, "maxY": 1360.0, "series": [{"data": [[33.0, 1360.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 1360.0, "minX": 33.0, "maxY": 1360.0, "series": [{"data": [[33.0, 1360.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 33.333333333333336, "minX": 1.5496077E12, "maxY": 33.333333333333336, "series": [{"data": [[1.5496077E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496077E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 33.333333333333336, "minX": 1.5496077E12, "maxY": 33.333333333333336, "series": [{"data": [[1.5496077E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496077E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 33.333333333333336, "minX": 1.5496077E12, "maxY": 33.333333333333336, "series": [{"data": [[1.5496077E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496077E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
