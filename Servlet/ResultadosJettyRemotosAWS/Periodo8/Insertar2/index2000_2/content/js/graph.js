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
        data: {"result": {"minY": 85.0, "minX": 0.0, "maxY": 4541.0, "series": [{"data": [[0.0, 85.0], [0.1, 98.0], [0.2, 109.0], [0.3, 112.0], [0.4, 117.0], [0.5, 118.0], [0.6, 119.0], [0.7, 122.0], [0.8, 124.0], [0.9, 125.0], [1.0, 126.0], [1.1, 130.0], [1.2, 131.0], [1.3, 133.0], [1.4, 134.0], [1.5, 136.0], [1.6, 138.0], [1.7, 138.0], [1.8, 139.0], [1.9, 140.0], [2.0, 142.0], [2.1, 143.0], [2.2, 144.0], [2.3, 146.0], [2.4, 146.0], [2.5, 147.0], [2.6, 147.0], [2.7, 148.0], [2.8, 149.0], [2.9, 150.0], [3.0, 151.0], [3.1, 153.0], [3.2, 155.0], [3.3, 156.0], [3.4, 156.0], [3.5, 157.0], [3.6, 158.0], [3.7, 159.0], [3.8, 161.0], [3.9, 162.0], [4.0, 162.0], [4.1, 163.0], [4.2, 163.0], [4.3, 163.0], [4.4, 164.0], [4.5, 164.0], [4.6, 164.0], [4.7, 166.0], [4.8, 166.0], [4.9, 166.0], [5.0, 167.0], [5.1, 168.0], [5.2, 168.0], [5.3, 170.0], [5.4, 171.0], [5.5, 173.0], [5.6, 174.0], [5.7, 175.0], [5.8, 178.0], [5.9, 179.0], [6.0, 179.0], [6.1, 180.0], [6.2, 180.0], [6.3, 181.0], [6.4, 181.0], [6.5, 182.0], [6.6, 184.0], [6.7, 186.0], [6.8, 187.0], [6.9, 188.0], [7.0, 189.0], [7.1, 189.0], [7.2, 190.0], [7.3, 190.0], [7.4, 191.0], [7.5, 191.0], [7.6, 191.0], [7.7, 194.0], [7.8, 195.0], [7.9, 196.0], [8.0, 197.0], [8.1, 198.0], [8.2, 199.0], [8.3, 201.0], [8.4, 201.0], [8.5, 201.0], [8.6, 202.0], [8.7, 202.0], [8.8, 204.0], [8.9, 205.0], [9.0, 205.0], [9.1, 206.0], [9.2, 207.0], [9.3, 207.0], [9.4, 208.0], [9.5, 208.0], [9.6, 210.0], [9.7, 210.0], [9.8, 212.0], [9.9, 212.0], [10.0, 212.0], [10.1, 214.0], [10.2, 216.0], [10.3, 216.0], [10.4, 217.0], [10.5, 217.0], [10.6, 218.0], [10.7, 218.0], [10.8, 220.0], [10.9, 222.0], [11.0, 223.0], [11.1, 223.0], [11.2, 224.0], [11.3, 224.0], [11.4, 226.0], [11.5, 227.0], [11.6, 228.0], [11.7, 229.0], [11.8, 230.0], [11.9, 231.0], [12.0, 232.0], [12.1, 232.0], [12.2, 233.0], [12.3, 234.0], [12.4, 235.0], [12.5, 237.0], [12.6, 237.0], [12.7, 238.0], [12.8, 238.0], [12.9, 238.0], [13.0, 239.0], [13.1, 239.0], [13.2, 241.0], [13.3, 242.0], [13.4, 243.0], [13.5, 244.0], [13.6, 244.0], [13.7, 245.0], [13.8, 246.0], [13.9, 247.0], [14.0, 248.0], [14.1, 249.0], [14.2, 249.0], [14.3, 249.0], [14.4, 249.0], [14.5, 249.0], [14.6, 250.0], [14.7, 252.0], [14.8, 253.0], [14.9, 253.0], [15.0, 254.0], [15.1, 254.0], [15.2, 254.0], [15.3, 255.0], [15.4, 255.0], [15.5, 256.0], [15.6, 258.0], [15.7, 258.0], [15.8, 260.0], [15.9, 262.0], [16.0, 262.0], [16.1, 262.0], [16.2, 262.0], [16.3, 263.0], [16.4, 264.0], [16.5, 265.0], [16.6, 265.0], [16.7, 266.0], [16.8, 267.0], [16.9, 269.0], [17.0, 269.0], [17.1, 269.0], [17.2, 272.0], [17.3, 274.0], [17.4, 275.0], [17.5, 277.0], [17.6, 278.0], [17.7, 279.0], [17.8, 280.0], [17.9, 281.0], [18.0, 281.0], [18.1, 282.0], [18.2, 283.0], [18.3, 284.0], [18.4, 287.0], [18.5, 289.0], [18.6, 290.0], [18.7, 290.0], [18.8, 293.0], [18.9, 293.0], [19.0, 293.0], [19.1, 295.0], [19.2, 296.0], [19.3, 298.0], [19.4, 300.0], [19.5, 302.0], [19.6, 302.0], [19.7, 304.0], [19.8, 305.0], [19.9, 307.0], [20.0, 308.0], [20.1, 310.0], [20.2, 311.0], [20.3, 312.0], [20.4, 314.0], [20.5, 317.0], [20.6, 321.0], [20.7, 326.0], [20.8, 328.0], [20.9, 330.0], [21.0, 331.0], [21.1, 338.0], [21.2, 339.0], [21.3, 339.0], [21.4, 342.0], [21.5, 346.0], [21.6, 352.0], [21.7, 354.0], [21.8, 356.0], [21.9, 360.0], [22.0, 365.0], [22.1, 377.0], [22.2, 403.0], [22.3, 404.0], [22.4, 420.0], [22.5, 434.0], [22.6, 494.0], [22.7, 539.0], [22.8, 543.0], [22.9, 548.0], [23.0, 565.0], [23.1, 575.0], [23.2, 581.0], [23.3, 604.0], [23.4, 616.0], [23.5, 629.0], [23.6, 664.0], [23.7, 672.0], [23.8, 677.0], [23.9, 697.0], [24.0, 721.0], [24.1, 732.0], [24.2, 748.0], [24.3, 772.0], [24.4, 784.0], [24.5, 794.0], [24.6, 796.0], [24.7, 805.0], [24.8, 817.0], [24.9, 825.0], [25.0, 829.0], [25.1, 833.0], [25.2, 841.0], [25.3, 847.0], [25.4, 855.0], [25.5, 861.0], [25.6, 866.0], [25.7, 868.0], [25.8, 870.0], [25.9, 874.0], [26.0, 874.0], [26.1, 892.0], [26.2, 895.0], [26.3, 895.0], [26.4, 903.0], [26.5, 909.0], [26.6, 910.0], [26.7, 919.0], [26.8, 922.0], [26.9, 927.0], [27.0, 932.0], [27.1, 933.0], [27.2, 934.0], [27.3, 938.0], [27.4, 945.0], [27.5, 947.0], [27.6, 949.0], [27.7, 949.0], [27.8, 956.0], [27.9, 962.0], [28.0, 964.0], [28.1, 968.0], [28.2, 970.0], [28.3, 973.0], [28.4, 978.0], [28.5, 981.0], [28.6, 984.0], [28.7, 991.0], [28.8, 993.0], [28.9, 999.0], [29.0, 1000.0], [29.1, 1006.0], [29.2, 1010.0], [29.3, 1013.0], [29.4, 1016.0], [29.5, 1017.0], [29.6, 1025.0], [29.7, 1026.0], [29.8, 1031.0], [29.9, 1035.0], [30.0, 1036.0], [30.1, 1040.0], [30.2, 1054.0], [30.3, 1057.0], [30.4, 1059.0], [30.5, 1064.0], [30.6, 1064.0], [30.7, 1066.0], [30.8, 1072.0], [30.9, 1076.0], [31.0, 1081.0], [31.1, 1084.0], [31.2, 1090.0], [31.3, 1091.0], [31.4, 1092.0], [31.5, 1097.0], [31.6, 1100.0], [31.7, 1104.0], [31.8, 1105.0], [31.9, 1108.0], [32.0, 1113.0], [32.1, 1114.0], [32.2, 1121.0], [32.3, 1125.0], [32.4, 1127.0], [32.5, 1142.0], [32.6, 1150.0], [32.7, 1156.0], [32.8, 1159.0], [32.9, 1161.0], [33.0, 1162.0], [33.1, 1169.0], [33.2, 1173.0], [33.3, 1179.0], [33.4, 1182.0], [33.5, 1189.0], [33.6, 1195.0], [33.7, 1203.0], [33.8, 1204.0], [33.9, 1209.0], [34.0, 1216.0], [34.1, 1227.0], [34.2, 1227.0], [34.3, 1233.0], [34.4, 1238.0], [34.5, 1245.0], [34.6, 1248.0], [34.7, 1250.0], [34.8, 1252.0], [34.9, 1262.0], [35.0, 1268.0], [35.1, 1273.0], [35.2, 1275.0], [35.3, 1287.0], [35.4, 1289.0], [35.5, 1292.0], [35.6, 1296.0], [35.7, 1301.0], [35.8, 1309.0], [35.9, 1313.0], [36.0, 1315.0], [36.1, 1318.0], [36.2, 1320.0], [36.3, 1325.0], [36.4, 1327.0], [36.5, 1328.0], [36.6, 1338.0], [36.7, 1341.0], [36.8, 1358.0], [36.9, 1363.0], [37.0, 1368.0], [37.1, 1370.0], [37.2, 1378.0], [37.3, 1382.0], [37.4, 1382.0], [37.5, 1387.0], [37.6, 1388.0], [37.7, 1389.0], [37.8, 1390.0], [37.9, 1392.0], [38.0, 1395.0], [38.1, 1397.0], [38.2, 1399.0], [38.3, 1402.0], [38.4, 1411.0], [38.5, 1411.0], [38.6, 1413.0], [38.7, 1416.0], [38.8, 1418.0], [38.9, 1424.0], [39.0, 1430.0], [39.1, 1434.0], [39.2, 1441.0], [39.3, 1445.0], [39.4, 1445.0], [39.5, 1449.0], [39.6, 1455.0], [39.7, 1458.0], [39.8, 1460.0], [39.9, 1465.0], [40.0, 1472.0], [40.1, 1477.0], [40.2, 1478.0], [40.3, 1484.0], [40.4, 1492.0], [40.5, 1504.0], [40.6, 1506.0], [40.7, 1510.0], [40.8, 1514.0], [40.9, 1520.0], [41.0, 1527.0], [41.1, 1534.0], [41.2, 1536.0], [41.3, 1542.0], [41.4, 1544.0], [41.5, 1555.0], [41.6, 1560.0], [41.7, 1569.0], [41.8, 1573.0], [41.9, 1573.0], [42.0, 1576.0], [42.1, 1583.0], [42.2, 1590.0], [42.3, 1596.0], [42.4, 1601.0], [42.5, 1604.0], [42.6, 1607.0], [42.7, 1625.0], [42.8, 1633.0], [42.9, 1635.0], [43.0, 1643.0], [43.1, 1648.0], [43.2, 1651.0], [43.3, 1654.0], [43.4, 1656.0], [43.5, 1660.0], [43.6, 1666.0], [43.7, 1668.0], [43.8, 1668.0], [43.9, 1673.0], [44.0, 1679.0], [44.1, 1681.0], [44.2, 1687.0], [44.3, 1690.0], [44.4, 1692.0], [44.5, 1694.0], [44.6, 1695.0], [44.7, 1701.0], [44.8, 1709.0], [44.9, 1712.0], [45.0, 1713.0], [45.1, 1716.0], [45.2, 1717.0], [45.3, 1719.0], [45.4, 1729.0], [45.5, 1732.0], [45.6, 1734.0], [45.7, 1735.0], [45.8, 1760.0], [45.9, 1769.0], [46.0, 1771.0], [46.1, 1774.0], [46.2, 1776.0], [46.3, 1777.0], [46.4, 1781.0], [46.5, 1790.0], [46.6, 1800.0], [46.7, 1809.0], [46.8, 1814.0], [46.9, 1815.0], [47.0, 1817.0], [47.1, 1821.0], [47.2, 1823.0], [47.3, 1828.0], [47.4, 1831.0], [47.5, 1833.0], [47.6, 1836.0], [47.7, 1840.0], [47.8, 1844.0], [47.9, 1847.0], [48.0, 1849.0], [48.1, 1856.0], [48.2, 1859.0], [48.3, 1868.0], [48.4, 1872.0], [48.5, 1881.0], [48.6, 1882.0], [48.7, 1885.0], [48.8, 1889.0], [48.9, 1890.0], [49.0, 1891.0], [49.1, 1899.0], [49.2, 1908.0], [49.3, 1912.0], [49.4, 1914.0], [49.5, 1921.0], [49.6, 1924.0], [49.7, 1926.0], [49.8, 1931.0], [49.9, 1936.0], [50.0, 1939.0], [50.1, 1943.0], [50.2, 1945.0], [50.3, 1946.0], [50.4, 1947.0], [50.5, 1948.0], [50.6, 1949.0], [50.7, 1954.0], [50.8, 1957.0], [50.9, 1959.0], [51.0, 1962.0], [51.1, 1962.0], [51.2, 1964.0], [51.3, 1964.0], [51.4, 1967.0], [51.5, 1970.0], [51.6, 1976.0], [51.7, 1977.0], [51.8, 1981.0], [51.9, 1983.0], [52.0, 1984.0], [52.1, 1984.0], [52.2, 1988.0], [52.3, 1993.0], [52.4, 1995.0], [52.5, 1999.0], [52.6, 2009.0], [52.7, 2009.0], [52.8, 2012.0], [52.9, 2014.0], [53.0, 2016.0], [53.1, 2021.0], [53.2, 2028.0], [53.3, 2031.0], [53.4, 2032.0], [53.5, 2038.0], [53.6, 2040.0], [53.7, 2044.0], [53.8, 2046.0], [53.9, 2049.0], [54.0, 2055.0], [54.1, 2056.0], [54.2, 2057.0], [54.3, 2062.0], [54.4, 2070.0], [54.5, 2071.0], [54.6, 2072.0], [54.7, 2072.0], [54.8, 2077.0], [54.9, 2079.0], [55.0, 2085.0], [55.1, 2086.0], [55.2, 2089.0], [55.3, 2092.0], [55.4, 2097.0], [55.5, 2099.0], [55.6, 2103.0], [55.7, 2105.0], [55.8, 2107.0], [55.9, 2111.0], [56.0, 2112.0], [56.1, 2113.0], [56.2, 2117.0], [56.3, 2118.0], [56.4, 2120.0], [56.5, 2122.0], [56.6, 2125.0], [56.7, 2128.0], [56.8, 2133.0], [56.9, 2134.0], [57.0, 2136.0], [57.1, 2138.0], [57.2, 2139.0], [57.3, 2141.0], [57.4, 2143.0], [57.5, 2146.0], [57.6, 2148.0], [57.7, 2152.0], [57.8, 2154.0], [57.9, 2155.0], [58.0, 2162.0], [58.1, 2165.0], [58.2, 2168.0], [58.3, 2169.0], [58.4, 2173.0], [58.5, 2173.0], [58.6, 2174.0], [58.7, 2176.0], [58.8, 2178.0], [58.9, 2179.0], [59.0, 2179.0], [59.1, 2182.0], [59.2, 2183.0], [59.3, 2184.0], [59.4, 2186.0], [59.5, 2187.0], [59.6, 2189.0], [59.7, 2190.0], [59.8, 2192.0], [59.9, 2194.0], [60.0, 2196.0], [60.1, 2202.0], [60.2, 2204.0], [60.3, 2205.0], [60.4, 2207.0], [60.5, 2208.0], [60.6, 2211.0], [60.7, 2214.0], [60.8, 2215.0], [60.9, 2223.0], [61.0, 2226.0], [61.1, 2227.0], [61.2, 2228.0], [61.3, 2228.0], [61.4, 2229.0], [61.5, 2232.0], [61.6, 2241.0], [61.7, 2242.0], [61.8, 2245.0], [61.9, 2247.0], [62.0, 2252.0], [62.1, 2254.0], [62.2, 2254.0], [62.3, 2256.0], [62.4, 2257.0], [62.5, 2259.0], [62.6, 2261.0], [62.7, 2261.0], [62.8, 2265.0], [62.9, 2267.0], [63.0, 2267.0], [63.1, 2268.0], [63.2, 2272.0], [63.3, 2274.0], [63.4, 2276.0], [63.5, 2278.0], [63.6, 2280.0], [63.7, 2283.0], [63.8, 2286.0], [63.9, 2291.0], [64.0, 2296.0], [64.1, 2297.0], [64.2, 2299.0], [64.3, 2300.0], [64.4, 2301.0], [64.5, 2303.0], [64.6, 2306.0], [64.7, 2309.0], [64.8, 2310.0], [64.9, 2313.0], [65.0, 2317.0], [65.1, 2318.0], [65.2, 2323.0], [65.3, 2325.0], [65.4, 2326.0], [65.5, 2328.0], [65.6, 2329.0], [65.7, 2329.0], [65.8, 2329.0], [65.9, 2330.0], [66.0, 2330.0], [66.1, 2331.0], [66.2, 2331.0], [66.3, 2333.0], [66.4, 2334.0], [66.5, 2335.0], [66.6, 2337.0], [66.7, 2338.0], [66.8, 2340.0], [66.9, 2342.0], [67.0, 2346.0], [67.1, 2347.0], [67.2, 2350.0], [67.3, 2351.0], [67.4, 2357.0], [67.5, 2359.0], [67.6, 2361.0], [67.7, 2361.0], [67.8, 2364.0], [67.9, 2368.0], [68.0, 2371.0], [68.1, 2374.0], [68.2, 2376.0], [68.3, 2378.0], [68.4, 2383.0], [68.5, 2385.0], [68.6, 2385.0], [68.7, 2385.0], [68.8, 2388.0], [68.9, 2390.0], [69.0, 2391.0], [69.1, 2393.0], [69.2, 2394.0], [69.3, 2397.0], [69.4, 2399.0], [69.5, 2399.0], [69.6, 2401.0], [69.7, 2406.0], [69.8, 2408.0], [69.9, 2408.0], [70.0, 2411.0], [70.1, 2414.0], [70.2, 2415.0], [70.3, 2416.0], [70.4, 2419.0], [70.5, 2421.0], [70.6, 2424.0], [70.7, 2426.0], [70.8, 2430.0], [70.9, 2431.0], [71.0, 2433.0], [71.1, 2435.0], [71.2, 2439.0], [71.3, 2440.0], [71.4, 2445.0], [71.5, 2449.0], [71.6, 2452.0], [71.7, 2454.0], [71.8, 2456.0], [71.9, 2458.0], [72.0, 2461.0], [72.1, 2464.0], [72.2, 2467.0], [72.3, 2469.0], [72.4, 2470.0], [72.5, 2472.0], [72.6, 2472.0], [72.7, 2473.0], [72.8, 2476.0], [72.9, 2478.0], [73.0, 2480.0], [73.1, 2485.0], [73.2, 2488.0], [73.3, 2491.0], [73.4, 2493.0], [73.5, 2494.0], [73.6, 2495.0], [73.7, 2497.0], [73.8, 2498.0], [73.9, 2498.0], [74.0, 2503.0], [74.1, 2503.0], [74.2, 2506.0], [74.3, 2510.0], [74.4, 2512.0], [74.5, 2516.0], [74.6, 2519.0], [74.7, 2523.0], [74.8, 2527.0], [74.9, 2529.0], [75.0, 2533.0], [75.1, 2535.0], [75.2, 2541.0], [75.3, 2545.0], [75.4, 2550.0], [75.5, 2555.0], [75.6, 2560.0], [75.7, 2564.0], [75.8, 2566.0], [75.9, 2567.0], [76.0, 2568.0], [76.1, 2573.0], [76.2, 2576.0], [76.3, 2580.0], [76.4, 2581.0], [76.5, 2586.0], [76.6, 2586.0], [76.7, 2588.0], [76.8, 2592.0], [76.9, 2595.0], [77.0, 2596.0], [77.1, 2598.0], [77.2, 2601.0], [77.3, 2604.0], [77.4, 2605.0], [77.5, 2608.0], [77.6, 2612.0], [77.7, 2617.0], [77.8, 2618.0], [77.9, 2625.0], [78.0, 2627.0], [78.1, 2628.0], [78.2, 2633.0], [78.3, 2634.0], [78.4, 2640.0], [78.5, 2645.0], [78.6, 2647.0], [78.7, 2651.0], [78.8, 2652.0], [78.9, 2655.0], [79.0, 2657.0], [79.1, 2660.0], [79.2, 2661.0], [79.3, 2663.0], [79.4, 2667.0], [79.5, 2669.0], [79.6, 2672.0], [79.7, 2678.0], [79.8, 2678.0], [79.9, 2680.0], [80.0, 2682.0], [80.1, 2683.0], [80.2, 2684.0], [80.3, 2686.0], [80.4, 2687.0], [80.5, 2694.0], [80.6, 2694.0], [80.7, 2697.0], [80.8, 2699.0], [80.9, 2702.0], [81.0, 2708.0], [81.1, 2711.0], [81.2, 2720.0], [81.3, 2721.0], [81.4, 2722.0], [81.5, 2727.0], [81.6, 2736.0], [81.7, 2743.0], [81.8, 2743.0], [81.9, 2747.0], [82.0, 2760.0], [82.1, 2761.0], [82.2, 2765.0], [82.3, 2766.0], [82.4, 2767.0], [82.5, 2770.0], [82.6, 2774.0], [82.7, 2779.0], [82.8, 2783.0], [82.9, 2788.0], [83.0, 2789.0], [83.1, 2792.0], [83.2, 2793.0], [83.3, 2793.0], [83.4, 2797.0], [83.5, 2801.0], [83.6, 2804.0], [83.7, 2805.0], [83.8, 2809.0], [83.9, 2814.0], [84.0, 2816.0], [84.1, 2817.0], [84.2, 2819.0], [84.3, 2823.0], [84.4, 2824.0], [84.5, 2829.0], [84.6, 2831.0], [84.7, 2835.0], [84.8, 2836.0], [84.9, 2841.0], [85.0, 2841.0], [85.1, 2845.0], [85.2, 2847.0], [85.3, 2848.0], [85.4, 2850.0], [85.5, 2852.0], [85.6, 2864.0], [85.7, 2869.0], [85.8, 2871.0], [85.9, 2875.0], [86.0, 2876.0], [86.1, 2881.0], [86.2, 2884.0], [86.3, 2886.0], [86.4, 2888.0], [86.5, 2895.0], [86.6, 2905.0], [86.7, 2908.0], [86.8, 2912.0], [86.9, 2913.0], [87.0, 2916.0], [87.1, 2922.0], [87.2, 2923.0], [87.3, 2925.0], [87.4, 2926.0], [87.5, 2930.0], [87.6, 2933.0], [87.7, 2937.0], [87.8, 2940.0], [87.9, 2945.0], [88.0, 2957.0], [88.1, 2958.0], [88.2, 2959.0], [88.3, 2960.0], [88.4, 2961.0], [88.5, 2964.0], [88.6, 2965.0], [88.7, 2972.0], [88.8, 2974.0], [88.9, 2976.0], [89.0, 2986.0], [89.1, 2990.0], [89.2, 2993.0], [89.3, 3000.0], [89.4, 3002.0], [89.5, 3008.0], [89.6, 3010.0], [89.7, 3016.0], [89.8, 3017.0], [89.9, 3018.0], [90.0, 3021.0], [90.1, 3022.0], [90.2, 3033.0], [90.3, 3035.0], [90.4, 3042.0], [90.5, 3048.0], [90.6, 3049.0], [90.7, 3059.0], [90.8, 3062.0], [90.9, 3063.0], [91.0, 3079.0], [91.1, 3080.0], [91.2, 3090.0], [91.3, 3096.0], [91.4, 3097.0], [91.5, 3099.0], [91.6, 3110.0], [91.7, 3112.0], [91.8, 3115.0], [91.9, 3124.0], [92.0, 3130.0], [92.1, 3131.0], [92.2, 3134.0], [92.3, 3135.0], [92.4, 3140.0], [92.5, 3142.0], [92.6, 3152.0], [92.7, 3156.0], [92.8, 3160.0], [92.9, 3173.0], [93.0, 3184.0], [93.1, 3188.0], [93.2, 3191.0], [93.3, 3194.0], [93.4, 3195.0], [93.5, 3201.0], [93.6, 3206.0], [93.7, 3207.0], [93.8, 3214.0], [93.9, 3224.0], [94.0, 3229.0], [94.1, 3239.0], [94.2, 3266.0], [94.3, 3271.0], [94.4, 3273.0], [94.5, 3276.0], [94.6, 3278.0], [94.7, 3280.0], [94.8, 3289.0], [94.9, 3308.0], [95.0, 3314.0], [95.1, 3319.0], [95.2, 3324.0], [95.3, 3329.0], [95.4, 3335.0], [95.5, 3339.0], [95.6, 3359.0], [95.7, 3362.0], [95.8, 3375.0], [95.9, 3381.0], [96.0, 3383.0], [96.1, 3412.0], [96.2, 3416.0], [96.3, 3429.0], [96.4, 3436.0], [96.5, 3463.0], [96.6, 3467.0], [96.7, 3473.0], [96.8, 3480.0], [96.9, 3483.0], [97.0, 3497.0], [97.1, 3502.0], [97.2, 3506.0], [97.3, 3515.0], [97.4, 3526.0], [97.5, 3538.0], [97.6, 3543.0], [97.7, 3547.0], [97.8, 3558.0], [97.9, 3563.0], [98.0, 3578.0], [98.1, 3617.0], [98.2, 3626.0], [98.3, 3638.0], [98.4, 3649.0], [98.5, 3672.0], [98.6, 3676.0], [98.7, 3699.0], [98.8, 3738.0], [98.9, 3765.0], [99.0, 3783.0], [99.1, 3820.0], [99.2, 3832.0], [99.3, 3847.0], [99.4, 3920.0], [99.5, 3949.0], [99.6, 3988.0], [99.7, 4110.0], [99.8, 4123.0], [99.9, 4411.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 223.0, "series": [{"data": [[0.0, 3.0], [600.0, 14.0], [700.0, 13.0], [800.0, 35.0], [900.0, 51.0], [1000.0, 53.0], [1100.0, 41.0], [1200.0, 41.0], [1300.0, 52.0], [1400.0, 45.0], [1500.0, 37.0], [100.0, 161.0], [1600.0, 47.0], [1700.0, 38.0], [1800.0, 51.0], [1900.0, 68.0], [2000.0, 60.0], [2100.0, 91.0], [2200.0, 84.0], [2300.0, 105.0], [2400.0, 89.0], [2500.0, 63.0], [2600.0, 74.0], [2700.0, 52.0], [2800.0, 62.0], [2900.0, 55.0], [3000.0, 45.0], [3100.0, 39.0], [200.0, 223.0], [3200.0, 28.0], [3300.0, 24.0], [3400.0, 20.0], [3500.0, 20.0], [3600.0, 13.0], [3700.0, 6.0], [3800.0, 7.0], [3900.0, 5.0], [4000.0, 1.0], [4100.0, 4.0], [4400.0, 1.0], [4500.0, 1.0], [300.0, 56.0], [400.0, 9.0], [500.0, 13.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 4500.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 358.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1190.0, "series": [{"data": [[1.0, 358.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 452.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1190.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 306.9809999999998, "minX": 1.54960788E12, "maxY": 306.9809999999998, "series": [{"data": [[1.54960788E12, 306.9809999999998]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 167.8, "minX": 1.0, "maxY": 4411.0, "series": [{"data": [[3.0, 2482.0], [4.0, 2137.0], [5.0, 2506.0], [6.0, 2284.0], [7.0, 2660.0], [8.0, 2497.0], [9.0, 2107.0], [10.0, 2196.0], [11.0, 2213.0], [12.0, 2191.0], [14.0, 2358.0], [15.0, 2135.0], [16.0, 2097.0], [17.0, 2155.0], [19.0, 2262.0], [20.0, 2277.0], [21.0, 2246.0], [22.0, 2278.0], [23.0, 2165.0], [24.0, 2350.0], [25.0, 644.1666666666666], [26.0, 530.3333333333333], [27.0, 627.8333333333333], [28.0, 561.6666666666666], [29.0, 300.46153846153845], [30.0, 436.25], [31.0, 419.22222222222223], [33.0, 441.0], [32.0, 468.8571428571429], [35.0, 822.6666666666666], [34.0, 507.66666666666663], [37.0, 504.42857142857144], [36.0, 411.375], [39.0, 487.85714285714283], [38.0, 167.8], [41.0, 794.4285714285714], [40.0, 179.11111111111111], [43.0, 335.83333333333337], [42.0, 318.5909090909091], [45.0, 471.5], [44.0, 211.2857142857143], [47.0, 241.14285714285717], [46.0, 553.3846153846154], [49.0, 436.91666666666663], [48.0, 1237.6], [51.0, 333.5238095238095], [50.0, 380.0], [53.0, 297.25], [52.0, 365.8571428571429], [55.0, 421.0869565217391], [54.0, 244.9310344827586], [57.0, 463.55555555555554], [56.0, 416.3333333333333], [59.0, 437.83333333333337], [58.0, 486.8888888888889], [61.0, 368.3529411764706], [60.0, 413.61538461538464], [63.0, 242.14285714285717], [62.0, 435.91666666666663], [66.0, 1350.5], [65.0, 1431.5], [64.0, 1130.0], [67.0, 319.0], [68.0, 251.66666666666666], [70.0, 253.0], [71.0, 1383.25], [69.0, 1923.5], [75.0, 2417.5], [73.0, 2784.0], [79.0, 2334.0], [78.0, 2480.0], [77.0, 2242.0], [76.0, 2331.0], [82.0, 2922.0], [81.0, 2871.0], [80.0, 2296.0], [87.0, 2597.5], [85.0, 2647.0], [84.0, 2964.5], [91.0, 3090.0], [90.0, 3033.0], [89.0, 2634.0], [88.0, 2596.0], [95.0, 2286.0], [94.0, 2580.0], [93.0, 2120.0], [92.0, 1993.0], [99.0, 2077.0], [98.0, 2331.0], [97.0, 3480.0], [96.0, 2770.0], [102.0, 2139.0], [101.0, 2440.0], [100.0, 2600.0], [107.0, 2222.0], [106.0, 2185.0], [105.0, 2276.0], [104.0, 2575.5], [111.0, 2765.0], [110.0, 3089.0], [109.0, 2594.0], [108.0, 2766.0], [115.0, 3273.0], [114.0, 2850.0], [113.0, 2926.0], [112.0, 3289.0], [119.0, 2647.0], [118.0, 2464.0], [117.0, 2346.0], [116.0, 3110.0], [123.0, 3851.0], [122.0, 2275.0], [121.0, 2304.0], [120.0, 2937.0], [127.0, 3547.0], [126.0, 2211.0], [125.0, 1960.0], [124.0, 4139.0], [135.0, 1957.0], [134.0, 2922.0], [133.0, 2876.0], [132.0, 2468.0], [131.0, 2974.0], [130.0, 2667.0], [129.0, 2957.0], [128.0, 3207.0], [143.0, 3556.0], [142.0, 2309.0], [141.0, 2586.0], [140.0, 1983.0], [139.0, 2656.0], [138.0, 2908.0], [137.0, 3567.0], [136.0, 2499.0], [151.0, 2441.0], [150.0, 2309.0], [149.0, 3470.0], [148.0, 3579.0], [147.0, 2814.0], [146.0, 2743.0], [145.0, 2797.0], [144.0, 2155.0], [159.0, 2329.0], [158.0, 3783.0], [157.0, 2912.0], [156.0, 3098.0], [155.0, 3319.0], [154.0, 2805.0], [153.0, 2779.0], [152.0, 2743.0], [167.0, 2535.0], [166.0, 2038.0], [165.0, 2253.0], [164.0, 2498.0], [163.0, 2824.0], [162.0, 2154.0], [161.0, 2529.0], [160.0, 2958.0], [175.0, 2612.0], [174.0, 3110.0], [173.0, 2351.0], [172.0, 3324.0], [171.0, 2187.0], [170.0, 4028.0], [169.0, 2329.0], [168.0, 3314.0], [183.0, 3280.0], [182.0, 2024.0], [181.0, 2495.0], [180.0, 2073.0], [179.0, 2660.0], [178.0, 2433.0], [177.0, 2558.0], [176.0, 2329.0], [191.0, 2323.0], [190.0, 2809.0], [189.0, 3638.0], [188.0, 2694.0], [187.0, 3142.0], [186.0, 2174.0], [185.0, 2368.0], [184.0, 2385.0], [199.0, 1574.0], [198.0, 2498.0], [197.0, 2028.0], [196.0, 2470.0], [195.0, 2634.0], [194.0, 3308.0], [193.0, 2850.0], [192.0, 2498.0], [204.0, 1504.3333333333335], [203.0, 1440.3333333333333], [202.0, 1809.0], [201.0, 1185.1666666666665], [200.0, 1104.5], [206.0, 1235.0], [205.0, 1448.3333333333335], [207.0, 1696.5], [208.0, 910.0], [211.0, 1912.0], [215.0, 2151.0], [214.0, 2214.0], [213.0, 2548.0], [212.0, 2016.0], [210.0, 2761.0], [209.0, 2776.0], [218.0, 1414.3333333333333], [220.0, 1452.0], [219.0, 2004.5], [222.0, 1226.0], [221.0, 1803.0], [223.0, 1559.6666666666665], [217.0, 2057.0], [216.0, 2875.0], [226.0, 2058.0], [225.0, 1555.0], [224.0, 1578.5], [228.0, 1292.2], [231.0, 1477.5], [230.0, 3288.0], [229.0, 2262.0], [227.0, 2686.0], [234.0, 1555.25], [235.0, 1730.0], [237.0, 1593.0], [238.0, 921.0], [239.0, 1875.0], [236.0, 2661.0], [233.0, 1952.0], [232.0, 2207.0], [246.0, 1439.0], [247.0, 1788.5], [245.0, 2846.0], [244.0, 2637.0], [243.0, 2979.0], [242.0, 2598.0], [241.0, 3359.0], [240.0, 3272.0], [248.0, 933.0], [253.0, 1052.2], [252.0, 1097.857142857143], [254.0, 1338.142857142857], [255.0, 1219.375], [251.0, 1692.75], [249.0, 2193.0], [258.0, 1292.75], [256.0, 1284.75], [257.0, 2330.0], [259.0, 1654.0], [268.0, 1458.6666666666665], [270.0, 1376.4], [269.0, 3535.0], [271.0, 3114.0], [261.0, 1197.625], [262.0, 1002.75], [260.0, 1475.5], [263.0, 1337.6000000000001], [264.0, 1669.0], [265.0, 2171.0], [267.0, 1250.0], [266.0, 2272.5], [286.0, 2388.0], [273.0, 2115.0], [278.0, 2459.0], [276.0, 2833.0], [279.0, 3115.0], [272.0, 2395.0], [281.0, 1338.5], [284.0, 1669.0], [275.0, 3207.0], [283.0, 1520.75], [282.0, 1566.5], [287.0, 3045.0], [280.0, 2525.0], [285.0, 2792.0], [290.0, 1347.111111111111], [288.0, 1967.3333333333335], [291.0, 1345.0], [300.0, 2913.0], [289.0, 1925.0], [293.0, 1593.0], [292.0, 2034.0], [294.0, 932.0], [295.0, 2806.5], [297.0, 1844.5], [298.0, 1851.0], [299.0, 3008.0], [302.0, 1443.0], [303.0, 1951.0], [296.0, 3051.0], [301.0, 1701.0], [318.0, 1994.5], [307.0, 1772.3333333333335], [308.0, 2177.5], [309.0, 2458.0], [311.0, 1668.0], [304.0, 1872.0], [306.0, 3239.0], [305.0, 3543.0], [310.0, 3276.0], [312.0, 1156.0], [313.0, 1243.6666666666665], [314.0, 1322.857142857143], [315.0, 2848.0], [317.0, 1436.0], [319.0, 4123.0], [316.0, 2604.0], [323.0, 1621.25], [321.0, 2037.0], [320.0, 1470.0], [322.0, 1769.6666666666665], [326.0, 1756.5], [324.0, 3018.0], [327.0, 1561.5], [328.0, 2074.0], [329.0, 1964.0], [331.0, 2973.0], [330.0, 2669.0], [334.0, 1948.0], [333.0, 3949.0], [332.0, 3847.0], [335.0, 2678.0], [350.0, 2855.5], [338.0, 1808.5], [337.0, 1894.0], [336.0, 3362.0], [339.0, 1880.0], [349.0, 3416.0], [348.0, 3016.0], [342.0, 1413.25], [341.0, 1445.0], [340.0, 2612.0], [344.0, 1945.5], [343.0, 1625.3333333333335], [346.0, 1735.6], [345.0, 2841.0], [347.0, 1588.5], [351.0, 2016.5], [364.0, 1948.0], [352.0, 1403.0], [353.0, 1730.5], [355.0, 1807.6666666666667], [354.0, 3675.0], [357.0, 1731.5], [356.0, 2452.0], [359.0, 3592.0], [361.0, 1849.5], [363.0, 1804.5], [362.0, 2975.0], [365.0, 1980.5], [366.0, 2453.5], [367.0, 2234.0], [360.0, 2617.0], [369.0, 1244.6666666666667], [368.0, 1507.8], [371.0, 2707.5], [370.0, 3183.5], [381.0, 3699.0], [380.0, 3188.0], [382.0, 1981.5], [383.0, 1806.0], [374.0, 1511.3999999999999], [373.0, 1555.2], [372.0, 1683.6666666666665], [375.0, 1573.0], [376.0, 2077.75], [378.0, 1561.5], [379.0, 3547.0], [377.0, 2612.5], [399.0, 3433.0], [386.0, 2337.0], [391.0, 1617.0], [385.0, 2632.0], [384.0, 3079.0], [390.0, 2011.0], [389.0, 2836.0], [388.0, 3660.0], [393.0, 1994.0], [392.0, 1921.142857142857], [394.0, 1607.6666666666667], [395.0, 2348.0], [396.0, 2530.5], [387.0, 2496.0], [398.0, 2605.0], [397.0, 2268.0], [401.0, 1842.25], [400.0, 2166.0], [402.0, 2136.0], [405.0, 2090.5], [404.0, 1947.0], [403.0, 1860.5], [407.0, 2352.3333333333335], [408.0, 2286.5], [414.0, 1678.5454545454547], [415.0, 2117.1111111111113], [413.0, 2326.6666666666665], [412.0, 2800.0], [410.0, 2193.3333333333335], [409.0, 3103.0], [411.0, 3324.0], [406.0, 1930.0], [418.0, 1753.4444444444446], [420.0, 1976.5454545454543], [419.0, 2282.888888888889], [417.0, 1631.3333333333333], [416.0, 2016.1666666666667], [421.0, 2020.142857142857], [422.0, 1888.0], [423.0, 3542.0], [428.0, 2608.0], [429.0, 1884.6], [430.0, 2028.6], [431.0, 1734.7142857142856], [424.0, 2933.0], [427.0, 3159.0], [425.0, 2241.0], [433.0, 1870.3333333333333], [432.0, 1909.111111111111], [439.0, 1856.6666666666667], [434.0, 1982.6153846153843], [435.0, 2089.153846153846], [438.0, 2249.714285714286], [437.0, 1886.4166666666667], [436.0, 1863.5], [442.0, 2048.0], [443.0, 1634.0], [441.0, 2631.0], [440.0, 2463.5], [446.0, 2588.3333333333335], [447.0, 2296.0], [445.0, 1643.0], [444.0, 2440.6666666666665], [449.0, 2081.0], [451.0, 2129.714285714286], [450.0, 2699.0], [453.0, 2475.6], [452.0, 2229.0], [454.0, 3155.5], [455.0, 2494.5], [448.0, 2031.0], [459.0, 2061.0], [460.0, 1816.1666666666667], [458.0, 2240.25], [461.0, 2620.6666666666665], [462.0, 2002.4], [463.0, 1906.0], [457.0, 2560.0], [456.0, 3394.0], [464.0, 2303.0], [466.0, 2168.25], [467.0, 2139.2], [477.0, 1930.0], [479.0, 2463.0], [478.0, 3135.0], [476.0, 2655.5], [465.0, 2333.5], [468.0, 2771.5], [470.0, 1827.6], [472.0, 2091.3846153846157], [473.0, 2240.25], [474.0, 2164.5], [475.0, 2907.0], [471.0, 2418.8333333333335], [469.0, 2623.25], [483.0, 2556.0], [480.0, 2167.3333333333335], [482.0, 1864.625], [481.0, 2571.25], [486.0, 2540.0], [485.0, 2044.0], [484.0, 2835.0], [487.0, 1941.0], [490.0, 2011.6666666666667], [491.0, 2186.8], [495.0, 2712.0], [489.0, 2173.0], [488.0, 2683.0], [494.0, 2570.0], [493.0, 3835.0], [492.0, 3738.0], [497.0, 2467.75], [496.0, 2230.8571428571427], [498.0, 1902.4], [499.0, 1833.0], [500.0, 2406.0], [502.0, 1795.0], [501.0, 2402.0], [504.0, 2071.0], [508.0, 2616.3333333333335], [510.0, 3832.0], [509.0, 2357.0], [511.0, 2420.25], [505.0, 2411.0], [507.0, 2659.3333333333335], [506.0, 2915.0], [503.0, 2013.7500000000002], [515.0, 2203.125], [516.0, 2125.0], [514.0, 2657.3333333333335], [517.0, 2429.5], [513.0, 2479.6], [512.0, 2519.8], [527.0, 1843.25], [525.0, 2424.2], [526.0, 2156.0], [524.0, 2459.6666666666665], [523.0, 2254.0], [518.0, 2953.6666666666665], [519.0, 2479.5], [528.0, 2317.8749999999995], [542.0, 2538.769230769231], [543.0, 2343.05], [538.0, 2178.809523809524], [540.0, 2204.0], [539.0, 2104.5000000000005], [541.0, 2264.5], [537.0, 2237.133333333333], [536.0, 2412.0625], [529.0, 2109.3333333333335], [535.0, 2419.0], [534.0, 2609.0], [532.0, 2435.0], [531.0, 2720.0], [530.0, 2397.0], [520.0, 2509.25], [521.0, 2363.0], [522.0, 2552.0], [551.0, 2163.5], [547.0, 2683.5], [544.0, 2340.2], [559.0, 1946.0], [558.0, 2428.0], [557.0, 2231.0], [556.0, 3278.0], [555.0, 2805.0], [554.0, 2071.0], [553.0, 2393.0], [552.0, 2676.0], [545.0, 2181.25], [548.0, 2335.777777777778], [546.0, 2233.5], [549.0, 2098.8], [550.0, 2073.0], [575.0, 2210.0], [561.0, 2384.0], [560.0, 3271.0], [563.0, 2965.0], [562.0, 1776.0], [565.0, 2399.0], [564.0, 2701.0], [567.0, 2385.0], [566.0, 3464.0], [574.0, 2905.0], [573.0, 3346.0], [572.0, 2804.0], [571.0, 3280.0], [570.0, 3049.0], [569.0, 3473.0], [568.0, 3096.0], [604.0, 3173.0], [607.0, 3063.0], [592.0, 3131.0], [594.0, 1983.0], [593.0, 3920.0], [596.0, 2503.0], [595.0, 2685.0], [606.0, 3538.0], [605.0, 2268.0], [603.0, 3152.0], [602.0, 2994.0], [601.0, 2421.0], [600.0, 3482.0], [591.0, 2801.0], [577.0, 2252.0], [576.0, 2183.0], [579.0, 3001.0], [578.0, 2961.0], [581.0, 3429.0], [580.0, 3820.0], [583.0, 3293.0], [582.0, 3010.0], [590.0, 3007.0], [588.0, 3097.0], [587.0, 2684.0], [586.0, 2871.0], [585.0, 3124.0], [584.0, 2888.0], [599.0, 2553.0], [597.0, 3721.0], [621.0, 3632.0], [622.0, 3156.0], [609.0, 3079.0], [608.0, 3009.0], [611.0, 3266.0], [610.0, 3025.0], [620.0, 2227.0], [619.0, 2959.0], [618.0, 2909.0], [617.0, 3101.5], [615.0, 4411.0], [614.0, 2375.0], [613.0, 2371.0], [612.0, 2682.0], [1.0, 2146.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[306.98150000000004, 1727.5024999999991]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 622.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 8400.0, "minX": 1.54960788E12, "maxY": 14031.433333333332, "series": [{"data": [[1.54960788E12, 14031.433333333332]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54960788E12, 8400.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 1727.5024999999991, "minX": 1.54960788E12, "maxY": 1727.5024999999991, "series": [{"data": [[1.54960788E12, 1727.5024999999991]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960788E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 1727.4955000000014, "minX": 1.54960788E12, "maxY": 1727.4955000000014, "series": [{"data": [[1.54960788E12, 1727.4955000000014]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960788E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 51.54650000000009, "minX": 1.54960788E12, "maxY": 51.54650000000009, "series": [{"data": [[1.54960788E12, 51.54650000000009]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960788E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 85.0, "minX": 1.54960788E12, "maxY": 4541.0, "series": [{"data": [[1.54960788E12, 4541.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54960788E12, 85.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54960788E12, 3020.7000000000003]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54960788E12, 3782.8900000000003]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54960788E12, 3313.95]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 1938.5, "minX": 33.0, "maxY": 1938.5, "series": [{"data": [[33.0, 1938.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 1938.5, "minX": 33.0, "maxY": 1938.5, "series": [{"data": [[33.0, 1938.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54960788E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54960788E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54960788E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54960788E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54960788E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54960788E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54960788E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54960788E12, "title": "Transactions Per Second"}},
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
