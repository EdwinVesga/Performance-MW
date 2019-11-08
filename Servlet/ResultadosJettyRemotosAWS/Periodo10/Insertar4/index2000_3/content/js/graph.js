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
        data: {"result": {"minY": 366.0, "minX": 0.0, "maxY": 13887.0, "series": [{"data": [[0.0, 366.0], [0.1, 404.0], [0.2, 408.0], [0.3, 412.0], [0.4, 427.0], [0.5, 442.0], [0.6, 455.0], [0.7, 456.0], [0.8, 463.0], [0.9, 479.0], [1.0, 480.0], [1.1, 484.0], [1.2, 487.0], [1.3, 492.0], [1.4, 499.0], [1.5, 515.0], [1.6, 517.0], [1.7, 523.0], [1.8, 529.0], [1.9, 541.0], [2.0, 553.0], [2.1, 565.0], [2.2, 579.0], [2.3, 581.0], [2.4, 598.0], [2.5, 607.0], [2.6, 612.0], [2.7, 615.0], [2.8, 619.0], [2.9, 655.0], [3.0, 657.0], [3.1, 659.0], [3.2, 668.0], [3.3, 678.0], [3.4, 696.0], [3.5, 725.0], [3.6, 752.0], [3.7, 760.0], [3.8, 767.0], [3.9, 818.0], [4.0, 831.0], [4.1, 837.0], [4.2, 840.0], [4.3, 859.0], [4.4, 886.0], [4.5, 902.0], [4.6, 917.0], [4.7, 931.0], [4.8, 939.0], [4.9, 966.0], [5.0, 1005.0], [5.1, 1029.0], [5.2, 1034.0], [5.3, 1078.0], [5.4, 1089.0], [5.5, 1098.0], [5.6, 1120.0], [5.7, 1131.0], [5.8, 1156.0], [5.9, 1161.0], [6.0, 1187.0], [6.1, 1215.0], [6.2, 1222.0], [6.3, 1266.0], [6.4, 1284.0], [6.5, 1292.0], [6.6, 1343.0], [6.7, 1348.0], [6.8, 1356.0], [6.9, 1404.0], [7.0, 1418.0], [7.1, 1443.0], [7.2, 1460.0], [7.3, 1513.0], [7.4, 1525.0], [7.5, 1536.0], [7.6, 1580.0], [7.7, 1635.0], [7.8, 1641.0], [7.9, 1671.0], [8.0, 1680.0], [8.1, 1696.0], [8.2, 1705.0], [8.3, 1711.0], [8.4, 1727.0], [8.5, 1747.0], [8.6, 1767.0], [8.7, 1781.0], [8.8, 1799.0], [8.9, 1818.0], [9.0, 1882.0], [9.1, 1885.0], [9.2, 1901.0], [9.3, 1920.0], [9.4, 1932.0], [9.5, 1940.0], [9.6, 2002.0], [9.7, 2047.0], [9.8, 2060.0], [9.9, 2080.0], [10.0, 2085.0], [10.1, 2128.0], [10.2, 2195.0], [10.3, 2258.0], [10.4, 2304.0], [10.5, 2362.0], [10.6, 2380.0], [10.7, 2431.0], [10.8, 2460.0], [10.9, 2472.0], [11.0, 2534.0], [11.1, 2576.0], [11.2, 2625.0], [11.3, 2655.0], [11.4, 2692.0], [11.5, 2705.0], [11.6, 2731.0], [11.7, 2736.0], [11.8, 2767.0], [11.9, 2806.0], [12.0, 2894.0], [12.1, 2913.0], [12.2, 3059.0], [12.3, 3069.0], [12.4, 3113.0], [12.5, 3135.0], [12.6, 3158.0], [12.7, 3165.0], [12.8, 3182.0], [12.9, 3189.0], [13.0, 3202.0], [13.1, 3210.0], [13.2, 3216.0], [13.3, 3262.0], [13.4, 3289.0], [13.5, 3334.0], [13.6, 3369.0], [13.7, 3376.0], [13.8, 3385.0], [13.9, 3411.0], [14.0, 3415.0], [14.1, 3423.0], [14.2, 3440.0], [14.3, 3471.0], [14.4, 3481.0], [14.5, 3491.0], [14.6, 3506.0], [14.7, 3515.0], [14.8, 3538.0], [14.9, 3550.0], [15.0, 3568.0], [15.1, 3576.0], [15.2, 3580.0], [15.3, 3593.0], [15.4, 3606.0], [15.5, 3630.0], [15.6, 3636.0], [15.7, 3640.0], [15.8, 3646.0], [15.9, 3652.0], [16.0, 3661.0], [16.1, 3680.0], [16.2, 3697.0], [16.3, 3705.0], [16.4, 3712.0], [16.5, 3717.0], [16.6, 3726.0], [16.7, 3746.0], [16.8, 3750.0], [16.9, 3757.0], [17.0, 3763.0], [17.1, 3785.0], [17.2, 3791.0], [17.3, 3802.0], [17.4, 3857.0], [17.5, 3863.0], [17.6, 3870.0], [17.7, 3875.0], [17.8, 3879.0], [17.9, 3881.0], [18.0, 3885.0], [18.1, 3895.0], [18.2, 3918.0], [18.3, 3922.0], [18.4, 3947.0], [18.5, 3954.0], [18.6, 3970.0], [18.7, 3991.0], [18.8, 4000.0], [18.9, 4027.0], [19.0, 4031.0], [19.1, 4037.0], [19.2, 4056.0], [19.3, 4071.0], [19.4, 4085.0], [19.5, 4089.0], [19.6, 4102.0], [19.7, 4108.0], [19.8, 4113.0], [19.9, 4128.0], [20.0, 4148.0], [20.1, 4176.0], [20.2, 4183.0], [20.3, 4196.0], [20.4, 4208.0], [20.5, 4213.0], [20.6, 4224.0], [20.7, 4240.0], [20.8, 4252.0], [20.9, 4265.0], [21.0, 4283.0], [21.1, 4287.0], [21.2, 4296.0], [21.3, 4304.0], [21.4, 4312.0], [21.5, 4313.0], [21.6, 4322.0], [21.7, 4328.0], [21.8, 4339.0], [21.9, 4346.0], [22.0, 4361.0], [22.1, 4382.0], [22.2, 4389.0], [22.3, 4396.0], [22.4, 4409.0], [22.5, 4421.0], [22.6, 4425.0], [22.7, 4443.0], [22.8, 4451.0], [22.9, 4454.0], [23.0, 4463.0], [23.1, 4467.0], [23.2, 4470.0], [23.3, 4492.0], [23.4, 4494.0], [23.5, 4496.0], [23.6, 4501.0], [23.7, 4510.0], [23.8, 4518.0], [23.9, 4526.0], [24.0, 4532.0], [24.1, 4539.0], [24.2, 4563.0], [24.3, 4577.0], [24.4, 4580.0], [24.5, 4586.0], [24.6, 4599.0], [24.7, 4611.0], [24.8, 4614.0], [24.9, 4620.0], [25.0, 4631.0], [25.1, 4638.0], [25.2, 4643.0], [25.3, 4659.0], [25.4, 4681.0], [25.5, 4685.0], [25.6, 4694.0], [25.7, 4697.0], [25.8, 4713.0], [25.9, 4724.0], [26.0, 4738.0], [26.1, 4753.0], [26.2, 4770.0], [26.3, 4771.0], [26.4, 4774.0], [26.5, 4779.0], [26.6, 4786.0], [26.7, 4789.0], [26.8, 4793.0], [26.9, 4800.0], [27.0, 4813.0], [27.1, 4818.0], [27.2, 4827.0], [27.3, 4829.0], [27.4, 4840.0], [27.5, 4858.0], [27.6, 4864.0], [27.7, 4873.0], [27.8, 4882.0], [27.9, 4883.0], [28.0, 4900.0], [28.1, 4903.0], [28.2, 4907.0], [28.3, 4915.0], [28.4, 4923.0], [28.5, 4931.0], [28.6, 4931.0], [28.7, 4942.0], [28.8, 4946.0], [28.9, 4965.0], [29.0, 4970.0], [29.1, 4977.0], [29.2, 4983.0], [29.3, 4996.0], [29.4, 4999.0], [29.5, 5007.0], [29.6, 5010.0], [29.7, 5034.0], [29.8, 5041.0], [29.9, 5057.0], [30.0, 5078.0], [30.1, 5083.0], [30.2, 5088.0], [30.3, 5095.0], [30.4, 5111.0], [30.5, 5123.0], [30.6, 5125.0], [30.7, 5150.0], [30.8, 5159.0], [30.9, 5170.0], [31.0, 5178.0], [31.1, 5200.0], [31.2, 5237.0], [31.3, 5238.0], [31.4, 5246.0], [31.5, 5260.0], [31.6, 5262.0], [31.7, 5263.0], [31.8, 5272.0], [31.9, 5279.0], [32.0, 5292.0], [32.1, 5315.0], [32.2, 5352.0], [32.3, 5358.0], [32.4, 5365.0], [32.5, 5376.0], [32.6, 5381.0], [32.7, 5388.0], [32.8, 5393.0], [32.9, 5399.0], [33.0, 5402.0], [33.1, 5408.0], [33.2, 5418.0], [33.3, 5424.0], [33.4, 5428.0], [33.5, 5433.0], [33.6, 5443.0], [33.7, 5444.0], [33.8, 5457.0], [33.9, 5472.0], [34.0, 5473.0], [34.1, 5483.0], [34.2, 5491.0], [34.3, 5498.0], [34.4, 5504.0], [34.5, 5510.0], [34.6, 5539.0], [34.7, 5545.0], [34.8, 5549.0], [34.9, 5550.0], [35.0, 5561.0], [35.1, 5579.0], [35.2, 5589.0], [35.3, 5593.0], [35.4, 5599.0], [35.5, 5603.0], [35.6, 5617.0], [35.7, 5627.0], [35.8, 5635.0], [35.9, 5638.0], [36.0, 5645.0], [36.1, 5659.0], [36.2, 5663.0], [36.3, 5672.0], [36.4, 5674.0], [36.5, 5680.0], [36.6, 5681.0], [36.7, 5690.0], [36.8, 5701.0], [36.9, 5721.0], [37.0, 5732.0], [37.1, 5746.0], [37.2, 5750.0], [37.3, 5759.0], [37.4, 5762.0], [37.5, 5775.0], [37.6, 5783.0], [37.7, 5790.0], [37.8, 5802.0], [37.9, 5816.0], [38.0, 5833.0], [38.1, 5845.0], [38.2, 5854.0], [38.3, 5863.0], [38.4, 5871.0], [38.5, 5883.0], [38.6, 5896.0], [38.7, 5917.0], [38.8, 5928.0], [38.9, 5932.0], [39.0, 5936.0], [39.1, 5950.0], [39.2, 5959.0], [39.3, 5974.0], [39.4, 6002.0], [39.5, 6017.0], [39.6, 6021.0], [39.7, 6024.0], [39.8, 6042.0], [39.9, 6045.0], [40.0, 6067.0], [40.1, 6089.0], [40.2, 6103.0], [40.3, 6117.0], [40.4, 6130.0], [40.5, 6133.0], [40.6, 6139.0], [40.7, 6144.0], [40.8, 6146.0], [40.9, 6158.0], [41.0, 6176.0], [41.1, 6179.0], [41.2, 6200.0], [41.3, 6209.0], [41.4, 6220.0], [41.5, 6233.0], [41.6, 6240.0], [41.7, 6247.0], [41.8, 6255.0], [41.9, 6256.0], [42.0, 6266.0], [42.1, 6276.0], [42.2, 6285.0], [42.3, 6291.0], [42.4, 6308.0], [42.5, 6317.0], [42.6, 6324.0], [42.7, 6341.0], [42.8, 6367.0], [42.9, 6388.0], [43.0, 6393.0], [43.1, 6401.0], [43.2, 6403.0], [43.3, 6415.0], [43.4, 6439.0], [43.5, 6444.0], [43.6, 6463.0], [43.7, 6473.0], [43.8, 6475.0], [43.9, 6485.0], [44.0, 6494.0], [44.1, 6515.0], [44.2, 6521.0], [44.3, 6538.0], [44.4, 6550.0], [44.5, 6555.0], [44.6, 6566.0], [44.7, 6567.0], [44.8, 6576.0], [44.9, 6587.0], [45.0, 6592.0], [45.1, 6600.0], [45.2, 6604.0], [45.3, 6623.0], [45.4, 6628.0], [45.5, 6635.0], [45.6, 6647.0], [45.7, 6653.0], [45.8, 6666.0], [45.9, 6715.0], [46.0, 6725.0], [46.1, 6727.0], [46.2, 6729.0], [46.3, 6737.0], [46.4, 6747.0], [46.5, 6774.0], [46.6, 6782.0], [46.7, 6788.0], [46.8, 6790.0], [46.9, 6807.0], [47.0, 6815.0], [47.1, 6834.0], [47.2, 6838.0], [47.3, 6848.0], [47.4, 6857.0], [47.5, 6866.0], [47.6, 6875.0], [47.7, 6882.0], [47.8, 6885.0], [47.9, 6904.0], [48.0, 6913.0], [48.1, 6925.0], [48.2, 6934.0], [48.3, 6947.0], [48.4, 6949.0], [48.5, 6955.0], [48.6, 6957.0], [48.7, 6974.0], [48.8, 6995.0], [48.9, 7012.0], [49.0, 7018.0], [49.1, 7031.0], [49.2, 7044.0], [49.3, 7052.0], [49.4, 7064.0], [49.5, 7072.0], [49.6, 7072.0], [49.7, 7088.0], [49.8, 7092.0], [49.9, 7098.0], [50.0, 7099.0], [50.1, 7113.0], [50.2, 7121.0], [50.3, 7131.0], [50.4, 7145.0], [50.5, 7154.0], [50.6, 7162.0], [50.7, 7170.0], [50.8, 7179.0], [50.9, 7194.0], [51.0, 7196.0], [51.1, 7202.0], [51.2, 7203.0], [51.3, 7211.0], [51.4, 7224.0], [51.5, 7239.0], [51.6, 7244.0], [51.7, 7247.0], [51.8, 7260.0], [51.9, 7266.0], [52.0, 7278.0], [52.1, 7299.0], [52.2, 7327.0], [52.3, 7331.0], [52.4, 7340.0], [52.5, 7358.0], [52.6, 7370.0], [52.7, 7372.0], [52.8, 7385.0], [52.9, 7390.0], [53.0, 7404.0], [53.1, 7420.0], [53.2, 7423.0], [53.3, 7427.0], [53.4, 7432.0], [53.5, 7441.0], [53.6, 7447.0], [53.7, 7458.0], [53.8, 7461.0], [53.9, 7462.0], [54.0, 7469.0], [54.1, 7475.0], [54.2, 7492.0], [54.3, 7497.0], [54.4, 7501.0], [54.5, 7509.0], [54.6, 7512.0], [54.7, 7514.0], [54.8, 7524.0], [54.9, 7527.0], [55.0, 7537.0], [55.1, 7541.0], [55.2, 7545.0], [55.3, 7556.0], [55.4, 7566.0], [55.5, 7583.0], [55.6, 7589.0], [55.7, 7598.0], [55.8, 7608.0], [55.9, 7612.0], [56.0, 7619.0], [56.1, 7623.0], [56.2, 7632.0], [56.3, 7645.0], [56.4, 7653.0], [56.5, 7658.0], [56.6, 7672.0], [56.7, 7678.0], [56.8, 7685.0], [56.9, 7702.0], [57.0, 7724.0], [57.1, 7733.0], [57.2, 7752.0], [57.3, 7755.0], [57.4, 7760.0], [57.5, 7778.0], [57.6, 7787.0], [57.7, 7790.0], [57.8, 7800.0], [57.9, 7802.0], [58.0, 7811.0], [58.1, 7818.0], [58.2, 7825.0], [58.3, 7831.0], [58.4, 7836.0], [58.5, 7845.0], [58.6, 7847.0], [58.7, 7867.0], [58.8, 7875.0], [58.9, 7884.0], [59.0, 7888.0], [59.1, 7894.0], [59.2, 7896.0], [59.3, 7897.0], [59.4, 7908.0], [59.5, 7912.0], [59.6, 7923.0], [59.7, 7937.0], [59.8, 7940.0], [59.9, 7965.0], [60.0, 7971.0], [60.1, 7984.0], [60.2, 7988.0], [60.3, 7993.0], [60.4, 8014.0], [60.5, 8021.0], [60.6, 8034.0], [60.7, 8047.0], [60.8, 8049.0], [60.9, 8057.0], [61.0, 8058.0], [61.1, 8065.0], [61.2, 8070.0], [61.3, 8079.0], [61.4, 8079.0], [61.5, 8088.0], [61.6, 8089.0], [61.7, 8094.0], [61.8, 8129.0], [61.9, 8145.0], [62.0, 8155.0], [62.1, 8160.0], [62.2, 8166.0], [62.3, 8175.0], [62.4, 8180.0], [62.5, 8189.0], [62.6, 8206.0], [62.7, 8220.0], [62.8, 8240.0], [62.9, 8243.0], [63.0, 8253.0], [63.1, 8255.0], [63.2, 8260.0], [63.3, 8274.0], [63.4, 8287.0], [63.5, 8295.0], [63.6, 8308.0], [63.7, 8322.0], [63.8, 8360.0], [63.9, 8367.0], [64.0, 8368.0], [64.1, 8398.0], [64.2, 8413.0], [64.3, 8433.0], [64.4, 8449.0], [64.5, 8469.0], [64.6, 8489.0], [64.7, 8491.0], [64.8, 8501.0], [64.9, 8507.0], [65.0, 8514.0], [65.1, 8523.0], [65.2, 8537.0], [65.3, 8555.0], [65.4, 8580.0], [65.5, 8595.0], [65.6, 8596.0], [65.7, 8604.0], [65.8, 8632.0], [65.9, 8633.0], [66.0, 8646.0], [66.1, 8675.0], [66.2, 8686.0], [66.3, 8691.0], [66.4, 8715.0], [66.5, 8724.0], [66.6, 8736.0], [66.7, 8753.0], [66.8, 8760.0], [66.9, 8763.0], [67.0, 8769.0], [67.1, 8769.0], [67.2, 8777.0], [67.3, 8782.0], [67.4, 8796.0], [67.5, 8802.0], [67.6, 8808.0], [67.7, 8833.0], [67.8, 8841.0], [67.9, 8844.0], [68.0, 8853.0], [68.1, 8856.0], [68.2, 8884.0], [68.3, 8893.0], [68.4, 8902.0], [68.5, 8909.0], [68.6, 8913.0], [68.7, 8927.0], [68.8, 8936.0], [68.9, 8939.0], [69.0, 8971.0], [69.1, 8974.0], [69.2, 8976.0], [69.3, 8988.0], [69.4, 9001.0], [69.5, 9004.0], [69.6, 9007.0], [69.7, 9019.0], [69.8, 9038.0], [69.9, 9047.0], [70.0, 9051.0], [70.1, 9059.0], [70.2, 9063.0], [70.3, 9093.0], [70.4, 9112.0], [70.5, 9114.0], [70.6, 9116.0], [70.7, 9141.0], [70.8, 9142.0], [70.9, 9173.0], [71.0, 9183.0], [71.1, 9197.0], [71.2, 9207.0], [71.3, 9217.0], [71.4, 9224.0], [71.5, 9235.0], [71.6, 9252.0], [71.7, 9261.0], [71.8, 9272.0], [71.9, 9303.0], [72.0, 9311.0], [72.1, 9337.0], [72.2, 9356.0], [72.3, 9369.0], [72.4, 9375.0], [72.5, 9381.0], [72.6, 9383.0], [72.7, 9408.0], [72.8, 9422.0], [72.9, 9427.0], [73.0, 9439.0], [73.1, 9449.0], [73.2, 9465.0], [73.3, 9482.0], [73.4, 9486.0], [73.5, 9493.0], [73.6, 9499.0], [73.7, 9507.0], [73.8, 9511.0], [73.9, 9524.0], [74.0, 9557.0], [74.1, 9560.0], [74.2, 9564.0], [74.3, 9568.0], [74.4, 9573.0], [74.5, 9578.0], [74.6, 9579.0], [74.7, 9585.0], [74.8, 9615.0], [74.9, 9625.0], [75.0, 9628.0], [75.1, 9640.0], [75.2, 9650.0], [75.3, 9655.0], [75.4, 9666.0], [75.5, 9671.0], [75.6, 9672.0], [75.7, 9681.0], [75.8, 9696.0], [75.9, 9712.0], [76.0, 9714.0], [76.1, 9723.0], [76.2, 9735.0], [76.3, 9741.0], [76.4, 9745.0], [76.5, 9752.0], [76.6, 9759.0], [76.7, 9771.0], [76.8, 9783.0], [76.9, 9788.0], [77.0, 9800.0], [77.1, 9815.0], [77.2, 9823.0], [77.3, 9824.0], [77.4, 9844.0], [77.5, 9850.0], [77.6, 9854.0], [77.7, 9858.0], [77.8, 9864.0], [77.9, 9867.0], [78.0, 9874.0], [78.1, 9892.0], [78.2, 9900.0], [78.3, 9910.0], [78.4, 9916.0], [78.5, 9922.0], [78.6, 9941.0], [78.7, 9943.0], [78.8, 9950.0], [78.9, 9953.0], [79.0, 9961.0], [79.1, 9967.0], [79.2, 9967.0], [79.3, 9972.0], [79.4, 9976.0], [79.5, 9978.0], [79.6, 9993.0], [79.7, 10000.0], [79.8, 10003.0], [79.9, 10004.0], [80.0, 10021.0], [80.1, 10029.0], [80.2, 10032.0], [80.3, 10048.0], [80.4, 10054.0], [80.5, 10064.0], [80.6, 10072.0], [80.7, 10075.0], [80.8, 10077.0], [80.9, 10080.0], [81.0, 10086.0], [81.1, 10090.0], [81.2, 10100.0], [81.3, 10107.0], [81.4, 10119.0], [81.5, 10126.0], [81.6, 10144.0], [81.7, 10152.0], [81.8, 10168.0], [81.9, 10169.0], [82.0, 10180.0], [82.1, 10183.0], [82.2, 10186.0], [82.3, 10200.0], [82.4, 10203.0], [82.5, 10214.0], [82.6, 10230.0], [82.7, 10234.0], [82.8, 10239.0], [82.9, 10247.0], [83.0, 10254.0], [83.1, 10259.0], [83.2, 10271.0], [83.3, 10275.0], [83.4, 10281.0], [83.5, 10286.0], [83.6, 10294.0], [83.7, 10298.0], [83.8, 10300.0], [83.9, 10309.0], [84.0, 10316.0], [84.1, 10328.0], [84.2, 10335.0], [84.3, 10342.0], [84.4, 10359.0], [84.5, 10366.0], [84.6, 10377.0], [84.7, 10379.0], [84.8, 10393.0], [84.9, 10402.0], [85.0, 10404.0], [85.1, 10409.0], [85.2, 10420.0], [85.3, 10424.0], [85.4, 10431.0], [85.5, 10435.0], [85.6, 10449.0], [85.7, 10466.0], [85.8, 10471.0], [85.9, 10477.0], [86.0, 10495.0], [86.1, 10497.0], [86.2, 10506.0], [86.3, 10510.0], [86.4, 10522.0], [86.5, 10526.0], [86.6, 10543.0], [86.7, 10571.0], [86.8, 10589.0], [86.9, 10592.0], [87.0, 10614.0], [87.1, 10625.0], [87.2, 10628.0], [87.3, 10632.0], [87.4, 10646.0], [87.5, 10649.0], [87.6, 10651.0], [87.7, 10656.0], [87.8, 10669.0], [87.9, 10680.0], [88.0, 10684.0], [88.1, 10685.0], [88.2, 10691.0], [88.3, 10694.0], [88.4, 10701.0], [88.5, 10716.0], [88.6, 10731.0], [88.7, 10750.0], [88.8, 10770.0], [88.9, 10782.0], [89.0, 10790.0], [89.1, 10794.0], [89.2, 10804.0], [89.3, 10812.0], [89.4, 10818.0], [89.5, 10823.0], [89.6, 10826.0], [89.7, 10830.0], [89.8, 10842.0], [89.9, 10845.0], [90.0, 10847.0], [90.1, 10852.0], [90.2, 10870.0], [90.3, 10880.0], [90.4, 10895.0], [90.5, 10903.0], [90.6, 10910.0], [90.7, 10916.0], [90.8, 10933.0], [90.9, 10943.0], [91.0, 10947.0], [91.1, 10952.0], [91.2, 10970.0], [91.3, 10985.0], [91.4, 10992.0], [91.5, 11008.0], [91.6, 11012.0], [91.7, 11022.0], [91.8, 11022.0], [91.9, 11027.0], [92.0, 11043.0], [92.1, 11049.0], [92.2, 11064.0], [92.3, 11066.0], [92.4, 11084.0], [92.5, 11123.0], [92.6, 11131.0], [92.7, 11142.0], [92.8, 11152.0], [92.9, 11162.0], [93.0, 11170.0], [93.1, 11189.0], [93.2, 11197.0], [93.3, 11199.0], [93.4, 11205.0], [93.5, 11215.0], [93.6, 11241.0], [93.7, 11248.0], [93.8, 11266.0], [93.9, 11267.0], [94.0, 11284.0], [94.1, 11294.0], [94.2, 11305.0], [94.3, 11312.0], [94.4, 11316.0], [94.5, 11324.0], [94.6, 11364.0], [94.7, 11382.0], [94.8, 11387.0], [94.9, 11416.0], [95.0, 11424.0], [95.1, 11440.0], [95.2, 11447.0], [95.3, 11453.0], [95.4, 11457.0], [95.5, 11462.0], [95.6, 11538.0], [95.7, 11567.0], [95.8, 11589.0], [95.9, 11639.0], [96.0, 11680.0], [96.1, 11686.0], [96.2, 11711.0], [96.3, 11756.0], [96.4, 11784.0], [96.5, 11834.0], [96.6, 11863.0], [96.7, 11901.0], [96.8, 11922.0], [96.9, 11968.0], [97.0, 11979.0], [97.1, 12090.0], [97.2, 12094.0], [97.3, 12162.0], [97.4, 12222.0], [97.5, 12262.0], [97.6, 12305.0], [97.7, 12356.0], [97.8, 12405.0], [97.9, 12421.0], [98.0, 12453.0], [98.1, 12469.0], [98.2, 12531.0], [98.3, 12578.0], [98.4, 12622.0], [98.5, 12674.0], [98.6, 12711.0], [98.7, 12758.0], [98.8, 12773.0], [98.9, 12838.0], [99.0, 12888.0], [99.1, 12915.0], [99.2, 13001.0], [99.3, 13063.0], [99.4, 13108.0], [99.5, 13270.0], [99.6, 13398.0], [99.7, 13434.0], [99.8, 13595.0], [99.9, 13884.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 300.0, "maxY": 31.0, "series": [{"data": [[300.0, 2.0], [400.0, 26.0], [500.0, 21.0], [600.0, 20.0], [700.0, 8.0], [800.0, 13.0], [900.0, 10.0], [1000.0, 11.0], [1100.0, 10.0], [1200.0, 10.0], [1300.0, 7.0], [1400.0, 8.0], [1500.0, 8.0], [1600.0, 9.0], [1700.0, 14.0], [1800.0, 7.0], [1900.0, 7.0], [2000.0, 10.0], [2100.0, 3.0], [2200.0, 3.0], [2300.0, 6.0], [2400.0, 5.0], [2500.0, 4.0], [2600.0, 7.0], [2700.0, 8.0], [2800.0, 4.0], [2900.0, 2.0], [3000.0, 4.0], [3100.0, 12.0], [3200.0, 9.0], [3300.0, 9.0], [3400.0, 13.0], [3500.0, 16.0], [3700.0, 21.0], [3600.0, 18.0], [3800.0, 17.0], [3900.0, 13.0], [4000.0, 16.0], [4100.0, 15.0], [4300.0, 23.0], [4200.0, 18.0], [4400.0, 24.0], [4500.0, 21.0], [4600.0, 23.0], [4700.0, 22.0], [4800.0, 22.0], [4900.0, 29.0], [5000.0, 19.0], [5100.0, 14.0], [5300.0, 19.0], [5200.0, 19.0], [5400.0, 28.0], [5600.0, 26.0], [5500.0, 21.0], [5700.0, 21.0], [5800.0, 17.0], [5900.0, 16.0], [6000.0, 16.0], [6100.0, 20.0], [6300.0, 13.0], [6200.0, 24.0], [6600.0, 16.0], [6500.0, 21.0], [6400.0, 20.0], [6700.0, 19.0], [6900.0, 19.0], [6800.0, 21.0], [7100.0, 21.0], [7000.0, 24.0], [7300.0, 17.0], [7200.0, 21.0], [7400.0, 28.0], [7500.0, 27.0], [7600.0, 23.0], [7700.0, 18.0], [7900.0, 20.0], [7800.0, 31.0], [8000.0, 28.0], [8100.0, 17.0], [8200.0, 19.0], [8600.0, 14.0], [8500.0, 17.0], [8300.0, 13.0], [8400.0, 12.0], [8700.0, 23.0], [8900.0, 20.0], [9000.0, 19.0], [8800.0, 18.0], [9100.0, 17.0], [9200.0, 13.0], [9400.0, 19.0], [9700.0, 23.0], [9500.0, 23.0], [9600.0, 21.0], [9300.0, 17.0], [9800.0, 24.0], [10000.0, 30.0], [9900.0, 30.0], [10100.0, 21.0], [10200.0, 31.0], [10400.0, 25.0], [10300.0, 22.0], [10700.0, 16.0], [10500.0, 16.0], [10600.0, 29.0], [11100.0, 18.0], [11200.0, 16.0], [10900.0, 20.0], [11000.0, 19.0], [10800.0, 26.0], [11600.0, 6.0], [11400.0, 15.0], [11500.0, 5.0], [11700.0, 7.0], [11300.0, 14.0], [11800.0, 4.0], [11900.0, 8.0], [12000.0, 3.0], [12100.0, 3.0], [12200.0, 3.0], [12300.0, 5.0], [12400.0, 8.0], [12700.0, 6.0], [12500.0, 4.0], [12600.0, 4.0], [12800.0, 3.0], [12900.0, 3.0], [13000.0, 4.0], [13300.0, 2.0], [13100.0, 2.0], [13200.0, 1.0], [13500.0, 2.0], [13400.0, 2.0], [13700.0, 1.0], [13800.0, 2.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 13800.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 28.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1854.0, "series": [{"data": [[1.0, 118.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 28.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1854.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 644.5655000000017, "minX": 1.54961904E12, "maxY": 644.5655000000017, "series": [{"data": [[1.54961904E12, 644.5655000000017]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961904E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 621.3333333333334, "minX": 1.0, "maxY": 13887.0, "series": [{"data": [[2.0, 11348.0], [3.0, 11447.0], [4.0, 11538.0], [5.0, 10903.0], [6.0, 11312.0], [7.0, 10497.0], [8.0, 10976.0], [9.0, 10294.0], [10.0, 11324.0], [11.0, 10770.0], [12.0, 11453.0], [13.0, 9977.0], [14.0, 10496.0], [15.0, 10200.0], [17.0, 10459.0], [18.0, 10168.0], [19.0, 10782.0], [20.0, 10186.0], [21.0, 10259.0], [22.0, 10298.0], [23.0, 10592.0], [24.0, 11027.0], [26.0, 10492.0], [27.0, 10794.0], [28.0, 10408.0], [29.0, 10086.0], [30.0, 10181.0], [31.0, 11575.0], [33.0, 10930.0], [32.0, 10656.0], [35.0, 10846.0], [34.0, 10427.0], [37.0, 10632.0], [36.0, 10821.0], [39.0, 11215.0], [38.0, 10378.0], [41.0, 10271.0], [40.0, 10589.0], [43.0, 10830.0], [42.0, 10899.0], [45.0, 10180.0], [44.0, 11371.0], [47.0, 10279.0], [46.0, 11303.0], [49.0, 11420.0], [48.0, 10788.0], [51.0, 10628.0], [50.0, 10510.0], [53.0, 10416.0], [52.0, 11189.0], [55.0, 10124.0], [54.0, 10649.0], [57.0, 10274.0], [56.0, 10985.0], [58.0, 10686.0], [61.0, 10241.0], [60.0, 10426.0], [63.0, 11382.0], [62.0, 11049.0], [67.0, 1387.6999999999998], [66.0, 1526.6666666666667], [65.0, 3965.0], [64.0, 11447.0], [68.0, 1281.357142857143], [69.0, 2084.5714285714284], [70.0, 5855.0], [71.0, 10366.0], [73.0, 2491.8], [72.0, 5525.0], [74.0, 621.3333333333334], [75.0, 7497.333333333333], [79.0, 630.0], [78.0, 5909.0], [77.0, 11457.0], [76.0, 10186.0], [80.0, 7346.333333333334], [82.0, 5810.5], [83.0, 5659.5], [81.0, 10895.0], [84.0, 3894.6666666666665], [87.0, 11199.0], [86.0, 10119.0], [85.0, 10943.0], [91.0, 10992.0], [90.0, 9858.0], [89.0, 11064.0], [88.0, 10685.0], [92.0, 3916.3333333333335], [93.0, 3658.6666666666665], [95.0, 2694.4], [94.0, 10259.0], [96.0, 725.0], [97.0, 7178.0], [99.0, 10827.0], [98.0, 11152.0], [102.0, 10467.0], [101.0, 11205.0], [100.0, 9952.0], [106.0, 4030.0], [105.0, 4100.333333333334], [107.0, 5325.0], [104.0, 12624.0], [111.0, 10880.0], [110.0, 9867.0], [109.0, 9745.0], [108.0, 11387.0], [112.0, 6063.5], [114.0, 4009.0], [115.0, 5369.0], [113.0, 10275.0], [119.0, 11065.0], [118.0, 10393.0], [117.0, 10842.0], [116.0, 10029.0], [121.0, 5514.0], [123.0, 10200.0], [122.0, 10682.0], [120.0, 11131.0], [127.0, 10254.0], [126.0, 10944.0], [125.0, 10300.0], [124.0, 9848.0], [130.0, 6263.5], [133.0, 6620.0], [134.0, 5678.0], [135.0, 5445.0], [132.0, 10790.0], [131.0, 10867.0], [129.0, 11214.0], [128.0, 10852.0], [136.0, 2899.4], [143.0, 10093.0], [142.0, 12936.0], [141.0, 10916.0], [140.0, 10404.0], [139.0, 11008.0], [138.0, 10632.0], [137.0, 11316.0], [144.0, 5289.0], [149.0, 3940.6666666666665], [151.0, 10021.0], [150.0, 10379.0], [148.0, 9823.0], [147.0, 10677.0], [146.0, 10692.0], [145.0, 11170.0], [153.0, 5413.0], [154.0, 5916.0], [158.0, 6542.0], [159.0, 9768.0], [157.0, 9560.0], [156.0, 10933.0], [155.0, 13887.0], [152.0, 9644.0], [161.0, 4248.0], [162.0, 6685.0], [163.0, 5809.0], [164.0, 4252.666666666666], [167.0, 10602.0], [166.0, 9774.0], [165.0, 10214.0], [160.0, 12888.0], [170.0, 4389.333333333334], [171.0, 6923.5], [174.0, 7317.5], [175.0, 12094.0], [173.0, 9696.0], [172.0, 9771.0], [169.0, 11043.0], [168.0, 10089.0], [177.0, 5449.5], [182.0, 5664.0], [183.0, 10254.0], [181.0, 9557.0], [180.0, 9797.0], [179.0, 12838.0], [178.0, 9978.0], [176.0, 12561.0], [189.0, 5574.0], [191.0, 9850.0], [190.0, 12913.0], [188.0, 9615.0], [187.0, 9976.0], [186.0, 9572.0], [185.0, 10614.0], [184.0, 10477.0], [192.0, 5774.5], [196.0, 5868.0], [199.0, 3252.5], [198.0, 5872.0], [197.0, 10422.0], [195.0, 13063.0], [194.0, 9482.0], [193.0, 9967.0], [200.0, 3916.0], [207.0, 11278.5], [205.0, 10910.0], [204.0, 9825.0], [203.0, 9499.0], [202.0, 12262.0], [201.0, 13087.0], [208.0, 7234.0], [210.0, 4572.0], [211.0, 5908.0], [213.0, 5843.5], [215.0, 1102.0], [214.0, 13021.0], [212.0, 9854.0], [209.0, 9655.0], [219.0, 5351.0], [220.0, 5748.0], [223.0, 5512.5], [222.0, 12412.0], [221.0, 9941.0], [218.0, 9943.0], [217.0, 10004.0], [216.0, 11524.5], [225.0, 5643.5], [224.0, 5346.666666666666], [231.0, 3381.25], [230.0, 4111.333333333334], [229.0, 11267.0], [228.0, 11650.0], [227.0, 9628.0], [226.0, 10680.0], [232.0, 7257.0], [233.0, 5590.0], [238.0, 6937.5], [237.0, 5429.0], [239.0, 9252.0], [236.0, 12773.0], [235.0, 9628.0], [234.0, 10402.0], [247.0, 12121.0], [246.0, 9362.0], [245.0, 13398.0], [244.0, 12578.0], [243.0, 13108.0], [242.0, 13595.0], [241.0, 10970.0], [240.0, 9427.0], [251.0, 1474.0], [255.0, 5687.0], [254.0, 9625.0], [253.0, 10171.0], [252.0, 9779.5], [250.0, 10653.0], [249.0, 10126.0], [248.0, 10988.0], [270.0, 5127.666666666666], [260.0, 5988.5], [262.0, 9998.0], [257.0, 13501.0], [256.0, 10331.0], [259.0, 10466.0], [258.0, 11439.0], [261.0, 12678.0], [265.0, 3572.25], [271.0, 10340.0], [269.0, 10431.0], [268.0, 9953.0], [267.0, 10506.0], [266.0, 10077.0], [264.0, 11290.5], [284.0, 5320.5], [272.0, 5391.333333333334], [273.0, 5803.0], [275.0, 10183.0], [274.0, 9183.0], [276.0, 5633.0], [277.0, 10012.0], [278.0, 6178.0], [279.0, 12222.0], [283.0, 5330.0], [282.0, 10635.0], [281.0, 9235.0], [280.0, 13001.0], [287.0, 10309.0], [286.0, 9696.0], [285.0, 12162.0], [303.0, 1535.5], [289.0, 5807.0], [293.0, 5552.5], [292.0, 9895.0], [295.0, 12748.0], [288.0, 10663.0], [294.0, 11836.0], [299.0, 4262.666666666666], [300.0, 5813.5], [290.0, 9785.0], [302.0, 7108.5], [301.0, 11711.0], [298.0, 11322.0], [297.0, 11402.0], [296.0, 10230.0], [317.0, 4370.25], [306.0, 7170.0], [305.0, 5424.5], [304.0, 10629.5], [311.0, 10054.0], [310.0, 10660.5], [308.0, 9566.0], [312.0, 5867.5], [315.0, 5495.5], [316.0, 7022.5], [307.0, 11241.0], [318.0, 6240.0], [319.0, 5636.0], [314.0, 12488.0], [313.0, 10590.0], [334.0, 11462.0], [322.0, 5381.5], [325.0, 4577.333333333334], [324.0, 12669.0], [327.0, 10235.0], [321.0, 11008.0], [320.0, 10211.0], [326.0, 11384.0], [335.0, 11204.0], [333.0, 11680.0], [332.0, 11248.0], [323.0, 9382.0], [331.0, 12711.0], [330.0, 10234.0], [329.0, 11793.0], [328.0, 11784.0], [348.0, 4520.0], [337.0, 6989.5], [340.0, 2899.5], [339.0, 6984.5], [338.0, 10790.0], [341.0, 5096.666666666666], [343.0, 9063.0], [336.0, 11721.0], [342.0, 9511.0], [351.0, 11265.0], [350.0, 10659.0], [347.0, 11022.0], [346.0, 9871.0], [345.0, 8973.0], [344.0, 10823.0], [367.0, 11702.0], [364.0, 5664.0], [355.0, 10488.0], [354.0, 8760.0], [353.0, 12855.0], [352.0, 11137.0], [365.0, 6155.0], [366.0, 6594.0], [363.0, 10370.0], [362.0, 11020.0], [361.0, 10075.0], [360.0, 10940.0], [359.0, 12424.0], [358.0, 12795.0], [357.0, 10826.0], [356.0, 10573.0], [383.0, 11988.0], [375.0, 6996.0], [374.0, 3930.5], [373.0, 11567.0], [372.0, 12094.0], [378.0, 7140.5], [381.0, 7156.5], [382.0, 8781.0], [380.0, 10625.0], [371.0, 10435.0], [370.0, 11545.0], [369.0, 12394.0], [368.0, 11284.0], [379.0, 11968.0], [377.0, 11863.0], [376.0, 12453.0], [396.0, 5367.0], [385.0, 4640.666666666666], [384.0, 7056.5], [391.0, 11012.0], [390.0, 9311.0], [389.0, 11197.0], [388.0, 10286.0], [386.0, 5402.0], [387.0, 11685.0], [399.0, 8449.0], [393.0, 10106.5], [398.0, 9211.0], [397.0, 9114.0], [395.0, 10032.0], [394.0, 10952.0], [415.0, 3849.75], [411.0, 6877.0], [414.0, 5971.0], [413.0, 10826.0], [412.0, 11129.0], [403.0, 11181.0], [402.0, 9640.0], [401.0, 10847.0], [400.0, 11267.0], [410.0, 10076.0], [409.0, 10342.0], [408.0, 11444.0], [407.0, 8802.0], [406.0, 8312.0], [405.0, 9181.0], [404.0, 10065.0], [430.0, 8067.0], [416.0, 4612.666666666666], [419.0, 6262.5], [418.0, 8936.0], [417.0, 9304.0], [423.0, 6216.0], [422.0, 5586.0], [421.0, 9085.0], [420.0, 9467.0], [424.0, 4790.666666666666], [425.0, 4529.666666666666], [427.0, 9047.0], [426.0, 9574.0], [431.0, 5959.5], [429.0, 10684.0], [428.0, 8865.0], [446.0, 4493.0], [435.0, 2084.0], [434.0, 10691.0], [433.0, 9398.0], [432.0, 11146.0], [438.0, 10203.0], [437.0, 8808.0], [436.0, 8438.0], [447.0, 6241.0], [445.0, 8940.0], [444.0, 10916.0], [443.0, 9369.0], [442.0, 8450.0], [441.0, 9422.0], [440.0, 9907.5], [463.0, 6768.0], [451.0, 7273.5], [452.0, 2605.3333333333335], [453.0, 8769.0], [455.0, 10621.0], [448.0, 11756.0], [450.0, 8537.0], [449.0, 8440.0], [454.0, 10022.0], [457.0, 6349.5], [456.0, 9410.0], [462.0, 11589.0], [461.0, 7937.0], [460.0, 11024.0], [459.0, 8501.0], [458.0, 9578.0], [478.0, 11878.0], [479.0, 9488.0], [477.0, 11084.0], [476.0, 9482.0], [475.0, 8508.0], [474.0, 8160.0], [473.0, 8936.0], [472.0, 8909.0], [471.0, 9573.0], [464.0, 11686.0], [467.0, 9767.5], [465.0, 7800.0], [470.0, 11901.0], [469.0, 10286.0], [468.0, 9014.0], [494.0, 7754.0], [481.0, 6451.0], [487.0, 4479.5], [480.0, 10316.0], [486.0, 10616.0], [484.0, 9356.0], [489.0, 6386.0], [491.0, 6127.5], [492.0, 6414.5], [483.0, 9817.0], [482.0, 10058.0], [495.0, 7896.0], [488.0, 9726.0], [493.0, 10952.0], [490.0, 10299.0], [510.0, 6925.5], [499.0, 4378.5], [511.0, 10443.0], [509.0, 10098.5], [507.0, 11197.0], [506.0, 10955.0], [505.0, 10890.0], [504.0, 11162.0], [503.0, 9910.0], [496.0, 10906.0], [498.0, 11237.0], [497.0, 10812.0], [502.0, 9197.0], [501.0, 9865.0], [500.0, 9857.0], [539.0, 10506.0], [516.0, 5347.0], [513.0, 6514.0], [512.0, 5737.0], [527.0, 10706.0], [514.0, 5471.666666666666], [515.0, 9261.0], [517.0, 6761.5], [518.0, 10669.0], [519.0, 6118.5], [521.0, 7017.0], [520.0, 9624.0], [523.0, 11103.0], [522.0, 9381.0], [525.0, 11066.0], [524.0, 10080.0], [526.0, 6772.5], [542.0, 10731.0], [528.0, 10328.0], [531.0, 10849.0], [529.0, 9226.0], [533.0, 11266.0], [532.0, 10571.0], [535.0, 10090.0], [534.0, 9207.0], [541.0, 10281.0], [540.0, 9655.0], [538.0, 10137.0], [537.0, 8902.0], [536.0, 10694.0], [572.0, 8367.0], [575.0, 9004.0], [561.0, 9750.0], [560.0, 10647.0], [563.0, 10320.0], [562.0, 8175.0], [565.0, 9001.0], [564.0, 9507.0], [574.0, 8687.0], [573.0, 8241.0], [571.0, 9584.0], [570.0, 8360.0], [569.0, 8186.0], [568.0, 9759.0], [559.0, 12305.0], [545.0, 9844.0], [544.0, 9504.5], [547.0, 9054.0], [546.0, 9107.0], [549.0, 10716.0], [548.0, 10247.0], [551.0, 9707.0], [550.0, 8884.0], [558.0, 10074.0], [557.0, 9892.0], [556.0, 10116.0], [555.0, 11167.0], [554.0, 9671.0], [553.0, 9524.0], [552.0, 10750.0], [567.0, 10079.0], [566.0, 10522.0], [604.0, 8769.0], [607.0, 9302.0], [593.0, 9433.0], [592.0, 9402.5], [595.0, 10300.0], [594.0, 8628.0], [597.0, 10072.0], [596.0, 9967.0], [606.0, 9812.0], [605.0, 7897.0], [603.0, 9303.0], [602.0, 8122.0], [601.0, 7809.0], [600.0, 8927.0], [590.0, 9422.0], [577.0, 10546.0], [576.0, 8398.0], [579.0, 8514.0], [578.0, 9374.0], [581.0, 9864.0], [580.0, 8507.0], [583.0, 9943.0], [582.0, 10543.0], [589.0, 9752.0], [588.0, 8974.0], [587.0, 9439.0], [586.0, 9059.0], [585.0, 8796.0], [584.0, 9508.0], [599.0, 8060.0], [598.0, 8254.0], [633.0, 9915.0], [638.0, 9511.0], [639.0, 8145.0], [624.0, 7459.0], [626.0, 8263.0], [625.0, 9671.0], [629.0, 7542.0], [628.0, 8673.0], [637.0, 9961.0], [636.0, 7989.0], [635.0, 9835.0], [632.0, 7423.0], [615.0, 7619.0], [614.0, 9852.0], [613.0, 10004.0], [612.0, 8070.0], [611.0, 9650.0], [610.0, 8846.0], [609.0, 8646.0], [608.0, 9007.0], [623.0, 7583.0], [622.0, 9900.0], [621.0, 7444.0], [620.0, 7536.0], [619.0, 8809.0], [618.0, 9988.0], [617.0, 9824.0], [616.0, 7501.0], [631.0, 8604.0], [630.0, 7638.0], [667.0, 5758.0], [658.0, 5522.666666666666], [656.0, 5201.0], [657.0, 7440.0], [668.0, 5307.5], [670.0, 7461.0], [669.0, 7492.0], [671.0, 3757.0], [659.0, 5469.5], [660.0, 7224.0], [662.0, 4500.75], [661.0, 4501.25], [663.0, 4779.0], [665.0, 7049.5], [664.0, 7681.0], [647.0, 7592.0], [646.0, 7490.0], [645.0, 9115.0], [644.0, 7884.0], [643.0, 8796.0], [642.0, 8632.0], [641.0, 7894.0], [640.0, 8057.0], [655.0, 8841.0], [654.0, 8675.0], [653.0, 8260.0], [652.0, 8833.0], [651.0, 7630.0], [650.0, 9141.0], [649.0, 8013.0], [648.0, 7420.0], [666.0, 5605.0], [677.0, 5267.666666666667], [673.0, 6390.5], [672.0, 6855.333333333333], [687.0, 9337.0], [686.0, 7072.0], [685.0, 9383.0], [684.0, 9222.0], [683.0, 7613.0], [682.0, 8795.0], [676.0, 4869.0], [675.0, 7685.0], [674.0, 6918.0], [678.0, 5497.0], [679.0, 4935.666666666667], [680.0, 6317.5], [681.0, 4567.25], [691.0, 3668.3333333333335], [703.0, 5584.5], [689.0, 7537.0], [688.0, 7982.0], [690.0, 9920.0], [700.0, 6222.666666666667], [701.0, 8433.0], [702.0, 4521.75], [697.0, 5239.333333333333], [696.0, 7260.0], [698.0, 4129.5], [692.0, 6399.666666666667], [693.0, 6032.0], [694.0, 5114.0], [695.0, 8538.0], [711.0, 4948.5], [706.0, 5935.5], [707.0, 5265.333333333333], [708.0, 8893.0], [710.0, 8731.0], [709.0, 7247.0], [712.0, 5098.5], [713.0, 7912.0], [714.0, 6355.0], [715.0, 4789.0], [717.0, 6727.0], [716.0, 9235.0], [719.0, 8853.0], [705.0, 8058.0], [704.0, 9186.0], [718.0, 9114.0], [721.0, 6610.0], [725.0, 5269.5], [724.0, 6834.0], [723.0, 8019.0], [722.0, 10359.0], [727.0, 7469.0], [726.0, 8856.0], [735.0, 8094.0], [720.0, 7202.0], [734.0, 6815.0], [733.0, 8855.0], [732.0, 9038.0], [731.0, 9019.0], [730.0, 8595.0], [729.0, 7566.0], [728.0, 7512.0], [763.0, 10386.0], [737.0, 5824.333333333333], [736.0, 4054.0], [751.0, 7837.0], [738.0, 4902.666666666667], [739.0, 8088.0], [741.0, 6550.0], [740.0, 7256.0], [743.0, 6788.0], [742.0, 9568.0], [760.0, 4615.333333333333], [761.0, 4180.5], [762.0, 7202.0], [764.0, 8255.0], [765.0, 4839.333333333333], [766.0, 4838.333333333333], [767.0, 7421.0], [753.0, 7846.0], [752.0, 9679.0], [744.0, 5973.5], [745.0, 8765.0], [747.0, 6947.0], [746.0, 6949.0], [748.0, 4988.5], [750.0, 6448.0], [749.0, 6225.0], [754.0, 5350.0], [757.0, 5102.25], [758.0, 5511.0], [759.0, 4872.0], [756.0, 5285.0], [755.0, 7300.5], [792.0, 4627.0], [768.0, 7283.0], [771.0, 4626.6], [773.0, 8490.0], [772.0, 6317.0], [775.0, 8782.0], [774.0, 7390.0], [794.0, 6426.0], [793.0, 7425.0], [795.0, 5759.0], [797.0, 8295.0], [796.0, 7099.0], [799.0, 4660.333333333333], [785.0, 7179.0], [784.0, 6256.0], [798.0, 8595.0], [770.0, 6431.0], [769.0, 5758.0], [776.0, 5294.5], [778.0, 7527.0], [777.0, 6653.0], [780.0, 7925.0], [779.0, 8036.0], [782.0, 5073.0], [781.0, 6806.5], [783.0, 4878.0], [786.0, 3944.6666666666665], [790.0, 4732.8], [789.0, 8596.0], [788.0, 8904.0], [787.0, 8658.5], [791.0, 5276.5], [805.0, 5500.0], [815.0, 4553.5], [800.0, 6240.5], [801.0, 6729.0], [802.0, 6733.0], [803.0, 5795.0], [804.0, 5701.0], [816.0, 5055.666666666667], [827.0, 5551.0], [828.0, 9681.0], [830.0, 8777.0], [829.0, 8155.0], [831.0, 7179.0], [825.0, 5853.0], [824.0, 6956.0], [807.0, 9723.0], [806.0, 6554.0], [826.0, 5794.5], [817.0, 6370.5], [818.0, 5008.5], [820.0, 4985.5], [821.0, 7013.5], [823.0, 7098.0], [822.0, 8399.0], [819.0, 6623.333333333333], [811.0, 6066.666666666667], [809.0, 10000.0], [808.0, 6847.0], [814.0, 4781.4], [813.0, 4246.0], [812.0, 6548.0], [857.0, 6094.0], [847.0, 5923.25], [835.0, 5234.8], [834.0, 6339.333333333333], [833.0, 9328.0], [837.0, 5316.25], [836.0, 9735.0], [838.0, 7757.0], [856.0, 7945.0], [839.0, 8844.0], [859.0, 5760.0], [858.0, 5353.0], [861.0, 8368.0], [860.0, 8505.0], [863.0, 7537.0], [862.0, 7984.0], [841.0, 5598.0], [840.0, 8243.0], [842.0, 5217.25], [843.0, 5477.666666666667], [844.0, 9465.0], [846.0, 6739.5], [845.0, 7044.0], [849.0, 6142.25], [854.0, 5019.0], [855.0, 6830.0], [853.0, 4916.333333333333], [852.0, 6951.5], [851.0, 6175.0], [850.0, 8691.0], [891.0, 5409.2], [867.0, 5292.0], [866.0, 5302.0], [865.0, 8489.0], [864.0, 7170.0], [877.0, 5202.0], [876.0, 8048.0], [875.0, 7278.0], [878.0, 7911.0], [879.0, 4805.2], [869.0, 4853.0], [870.0, 5346.0], [871.0, 5765.5], [888.0, 7738.0], [890.0, 9047.0], [889.0, 5407.0], [892.0, 6648.0], [893.0, 8253.0], [895.0, 5329.25], [894.0, 6034.5], [880.0, 4496.0], [883.0, 6668.0], [882.0, 5314.0], [881.0, 8685.0], [884.0, 6025.5], [886.0, 6902.5], [887.0, 6433.0], [885.0, 5998.0], [868.0, 5599.0], [873.0, 5076.333333333334], [874.0, 6505.0], [872.0, 4111.5], [900.0, 7060.5], [907.0, 5583.5], [899.0, 5882.666666666667], [898.0, 7678.0], [897.0, 7092.0], [896.0, 7541.0], [911.0, 5684.0], [910.0, 8474.0], [901.0, 5402.0], [902.0, 6306.0], [920.0, 6571.0], [903.0, 8491.0], [922.0, 8163.0], [921.0, 6538.0], [924.0, 8736.0], [923.0, 5433.0], [926.0, 6962.5], [927.0, 5357.666666666667], [925.0, 6881.666666666667], [912.0, 5532.0], [913.0, 4535.0], [914.0, 5639.75], [915.0, 5484.6], [916.0, 6623.0], [917.0, 5921.25], [919.0, 7965.0], [918.0, 8469.0], [904.0, 6000.0], [905.0, 5661.0], [906.0, 6215.333333333333], [909.0, 6373.333333333333], [908.0, 5800.0], [958.0, 5391.666666666666], [932.0, 6246.0], [930.0, 5105.166666666666], [929.0, 5959.75], [928.0, 4586.0], [931.0, 5672.333333333333], [935.0, 6927.0], [934.0, 6311.0], [933.0, 7163.0], [952.0, 6466.666666666667], [955.0, 4929.75], [954.0, 7993.0], [953.0, 7514.0], [957.0, 5553.0], [956.0, 4975.0], [959.0, 5353.5], [944.0, 8523.0], [943.0, 5964.5], [942.0, 8931.0], [941.0, 8601.0], [940.0, 8306.0], [939.0, 8093.0], [938.0, 7145.0], [937.0, 8777.0], [936.0, 7800.0], [945.0, 5757.5], [946.0, 5869.333333333333], [947.0, 5725.5], [948.0, 5561.6], [949.0, 5469.666666666667], [950.0, 5357.4], [951.0, 5561.0], [984.0, 5668.5], [978.0, 5549.888888888889], [964.0, 5771.5], [967.0, 5540.666666666667], [966.0, 8360.0], [985.0, 6027.333333333333], [986.0, 6034.0], [987.0, 5408.0], [988.0, 6475.5], [991.0, 5800.0], [990.0, 6741.0], [989.0, 6628.0], [970.0, 5887.0], [969.0, 7427.0], [968.0, 8253.0], [971.0, 7121.0], [972.0, 6402.0], [975.0, 8383.0], [961.0, 6350.0], [960.0, 8530.0], [963.0, 8633.0], [962.0, 7971.0], [974.0, 6725.0], [973.0, 7327.0], [980.0, 6334.0], [982.0, 6225.5], [981.0, 7299.0], [983.0, 6205.666666666667], [979.0, 5370.0], [977.0, 5738.0], [976.0, 6496.5], [1017.0, 5940.0], [1003.0, 5462.75], [995.0, 5895.5], [996.0, 5959.666666666667], [998.0, 8014.0], [997.0, 6737.0], [1016.0, 6470.0], [999.0, 6807.0], [1023.0, 5762.5], [1022.0, 6567.0], [1021.0, 6439.0], [1020.0, 8635.0], [1019.0, 6556.0], [1018.0, 7162.0], [1000.0, 6562.5], [1001.0, 6173.5], [1002.0, 5792.5], [1004.0, 5814.857142857143], [1005.0, 5175.5], [1007.0, 5832.5], [994.0, 8089.0], [993.0, 7012.0], [992.0, 5813.0], [1006.0, 6949.0], [1008.0, 6093.666666666667], [1009.0, 5179.5], [1011.0, 6263.333333333333], [1013.0, 7432.0], [1012.0, 8079.0], [1015.0, 5957.0], [1014.0, 6628.0], [1010.0, 6670.0], [1026.0, 5660.0], [1024.0, 6078.666666666667], [1054.0, 6565.666666666667], [1052.0, 6002.0], [1048.0, 7356.0], [1050.0, 6197.0], [1044.0, 7881.0], [1042.0, 7671.0], [1046.0, 6229.0], [1040.0, 6367.0], [1028.0, 6715.5], [1030.0, 6061.428571428572], [1034.0, 7239.0], [1036.0, 6156.0], [1038.0, 5845.428571428572], [1058.0, 5648.0], [1060.0, 6308.0], [1062.0, 6200.0], [1066.0, 6671.0], [1064.0, 7653.0], [1068.0, 8280.0], [1070.0, 6291.0], [1056.0, 6400.0], [1086.0, 5657.0], [1084.0, 6028.666666666667], [1082.0, 7556.0], [1080.0, 5974.0], [1078.0, 5766.666666666667], [1074.0, 6168.0], [1072.0, 7113.0], [1076.0, 6653.0], [1032.0, 7093.0], [1092.0, 6240.0], [1094.0, 5830.2], [1088.0, 5443.0], [1118.0, 6089.0], [1116.0, 5778.0], [1108.0, 5672.0], [1110.0, 6523.0], [1112.0, 7787.0], [1114.0, 5314.333333333333], [1104.0, 6174.0], [1106.0, 7178.666666666667], [1090.0, 6863.0], [1096.0, 6401.0], [1100.0, 6359.5], [1098.0, 6639.0], [1102.0, 6555.0], [1136.0, 7344.666666666667], [1138.0, 5263.0], [1144.0, 6274.0], [1142.0, 6747.0], [1140.0, 6822.0], [1146.0, 5381.5], [1150.0, 7509.0], [1148.0, 5775.0], [1120.0, 5808.0], [1122.0, 7399.0], [1124.0, 7562.0], [1134.0, 6849.0], [1132.0, 8047.0], [1130.0, 5444.0], [1128.0, 6130.0], [1126.0, 7545.0], [1152.0, 5914.0], [1172.0, 6403.0], [1174.0, 6809.0], [1176.0, 4443.0], [1168.0, 6925.0], [1170.0, 7361.333333333333], [1154.0, 5939.5], [1160.0, 6303.0], [1156.0, 6415.0], [1162.0, 7089.0], [1164.0, 5753.333333333333], [1166.0, 6103.4], [1027.0, 5378.0], [1055.0, 7116.0], [1051.0, 7103.0], [1053.0, 5517.0], [1047.0, 6134.0], [1049.0, 6974.0], [1045.0, 6145.0], [1043.0, 7598.0], [1041.0, 5822.0], [1025.0, 6395.0], [1031.0, 5710.5], [1029.0, 5837.5], [1033.0, 5745.0], [1035.0, 7161.0], [1037.0, 7802.0], [1039.0, 6166.5], [1059.0, 6810.0], [1061.0, 7702.0], [1063.0, 6095.333333333333], [1065.0, 7623.0], [1067.0, 6734.0], [1069.0, 8206.0], [1071.0, 6429.0], [1057.0, 6245.666666666667], [1087.0, 6968.0], [1085.0, 5989.0], [1083.0, 6604.0], [1081.0, 6784.0], [1079.0, 5862.333333333333], [1073.0, 7388.0], [1075.0, 7553.0], [1077.0, 6622.333333333333], [1093.0, 6543.5], [1119.0, 6464.0], [1117.0, 5746.0], [1115.0, 6029.5], [1107.0, 6463.0], [1109.0, 6727.0], [1111.0, 6392.0], [1113.0, 7497.0], [1105.0, 7018.0], [1089.0, 6768.333333333333], [1091.0, 8051.0], [1095.0, 6460.5], [1097.0, 6826.5], [1099.0, 6444.0], [1101.0, 5655.333333333333], [1103.0, 6588.333333333333], [1137.0, 6566.0], [1145.0, 5730.666666666667], [1143.0, 7940.0], [1141.0, 6130.0], [1139.0, 6401.0], [1151.0, 7778.0], [1149.0, 5932.0], [1147.0, 6236.0], [1121.0, 6709.0], [1123.0, 6475.0], [1125.0, 6288.333333333333], [1135.0, 5777.6], [1133.0, 8206.0], [1131.0, 7505.0], [1129.0, 7203.0], [1127.0, 7230.0], [1153.0, 6290.0], [1155.0, 6746.0], [1171.0, 5237.0], [1173.0, 6354.0], [1175.0, 6594.0], [1169.0, 5814.333333333333], [1159.0, 6252.5], [1157.0, 7519.0], [1161.0, 6388.0], [1163.0, 5955.0], [1165.0, 5591.5], [1167.0, 6296.833333333334], [1.0, 11416.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[644.5655000000017, 6907.214500000005]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1176.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 12566.666666666666, "minX": 1.54961904E12, "maxY": 14031.066666666668, "series": [{"data": [[1.54961904E12, 14031.066666666668]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54961904E12, 12566.666666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961904E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 6907.214500000005, "minX": 1.54961904E12, "maxY": 6907.214500000005, "series": [{"data": [[1.54961904E12, 6907.214500000005]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961904E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 6907.205499999998, "minX": 1.54961904E12, "maxY": 6907.205499999998, "series": [{"data": [[1.54961904E12, 6907.205499999998]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961904E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 40.5715, "minX": 1.54961904E12, "maxY": 40.5715, "series": [{"data": [[1.54961904E12, 40.5715]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961904E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 366.0, "minX": 1.54961904E12, "maxY": 13887.0, "series": [{"data": [[1.54961904E12, 13887.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54961904E12, 366.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54961904E12, 10846.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54961904E12, 12887.67]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54961904E12, 11423.8]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961904E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 7099.0, "minX": 33.0, "maxY": 7099.0, "series": [{"data": [[33.0, 7099.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 7099.0, "minX": 33.0, "maxY": 7099.0, "series": [{"data": [[33.0, 7099.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961904E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961904E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961904E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961904E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961904E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54961904E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 33.333333333333336, "minX": 1.54961904E12, "maxY": 33.333333333333336, "series": [{"data": [[1.54961904E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54961904E12, "title": "Transactions Per Second"}},
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
